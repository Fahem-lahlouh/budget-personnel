import SwiftUI
import UIKit
import SwiftData

/// Écran des réglages.
struct SettingsView: View {

    let settings: AppSettings

    @Environment(\.modelContext) private var context
    @Environment(LockManager.self) private var lock

    @Query private var categories: [CategoryItem]
    @Query private var merchants: [MerchantItem]
    @Query private var recurring: [RecurringExpense]
    @Query private var expenses: [Expense]

    @State private var pinFlow: PinFlow?
    @State private var exportURL: URL?
    @State private var exportIncludesConfidential = true
    @State private var showExportOptions = false
    @State private var showResetConfirmation = false
    @State private var showReseedConfirmation = false
    @State private var errorMessage: String?

    private enum PinFlow: Identifiable {
        case create, change
        var id: String { self == .create ? "create" : "change" }
    }

    var body: some View {
        NavigationStack {
            List {
                confidentialitySection
                listsSection
                recurringSection
                appearanceSection
                dataSection
                aboutSection
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Palette.background)
            .navigationTitle("Réglages")
            .sheet(item: $pinFlow) { flow in
                PinSetupView(mode: flow == .create ? .create : .change) { success in
                    if success, flow == .create {
                        settings.isLockEnabled = true
                        context.saveChanges()
                        lock.apply(settings: settings)
                    }
                }
            }
            .sheet(item: Binding(get: { exportURL.map(ExportFile.init) }, set: { if $0 == nil { exportURL = nil } })) { file in
                ShareSheet(url: file.url)
            }
            .confirmationDialog("Exporter mes dépenses", isPresented: $showExportOptions, titleVisibility: .visible) {
                Button("Tout exporter") { export(includeConfidential: true) }
                Button("Exclure les dépenses confidentielles") { export(includeConfidential: false) }
                Button("Annuler", role: .cancel) {}
            } message: {
                Text("Un fichier CSV sera créé, lisible dans Excel et Numbers.")
            }
            .alert("Erreur", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
                Button("OK") { errorMessage = nil }
            } message: {
                Text(errorMessage ?? "")
            }
        }
    }

    // MARK: - Confidentialité

    private var confidentialitySection: some View {
        Section {
            Toggle(isOn: Binding(
                get: { settings.isLockEnabled },
                set: { toggleLock($0) }
            )) {
                Label("Verrouiller l'app par code", systemImage: "lock.fill")
            }
            .tint(Palette.accent)

            if settings.isLockEnabled {
                Button {
                    Haptics.tap()
                    pinFlow = .change
                } label: {
                    Label("Modifier le code PIN", systemImage: "key.fill")
                }

                if LockManager.canUseBiometrics() {
                    Toggle(isOn: Binding(
                        get: { settings.isBiometricsEnabled },
                        set: { newValue in
                            settings.isBiometricsEnabled = newValue
                            context.saveChanges()
                            lock.apply(settings: settings)
                        }
                    )) {
                        Label("Déverrouiller avec \(LockManager.biometryLabel)", systemImage: LockManager.biometrySymbol)
                    }
                    .tint(Palette.accent)
                } else {
                    Label {
                        Text("Aucune biométrie disponible sur cet appareil.")
                            .font(.footnote)
                            .foregroundStyle(Palette.textSecondary)
                    } icon: {
                        Image(systemName: "faceid").foregroundStyle(Palette.textTertiary)
                    }
                }
            }

            Toggle(isOn: Binding(
                get: { settings.requiresSecondUnlockForConfidential },
                set: { newValue in
                    settings.requiresSecondUnlockForConfidential = newValue
                    context.saveChanges()
                    lock.apply(settings: settings)
                }
            )) {
                VStack(alignment: .leading, spacing: 2) {
                    Label("Second niveau pour les dépenses confidentielles", systemImage: "eye.slash.fill")
                    Text("Les dépenses marquées « Confidentiel » restent masquées après le déverrouillage global.")
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            .tint(Palette.accent)
        } header: {
            Text("Confidentialité")
        } footer: {
            Text("Le code est enregistré haché dans le Trousseau iOS, jamais en clair. Il protège l'affichage des montants dans l'app ; les données elles-mêmes sont protégées par le code de déverrouillage de l'iPhone.")
        }
        .listRowBackground(Palette.surface)
    }

    private func toggleLock(_ enabled: Bool) {
        if enabled {
            pinFlow = .create
        } else {
            PinStore.removePin()
            settings.isLockEnabled = false
            settings.isBiometricsEnabled = false
            context.saveChanges()
            lock.apply(settings: settings)
        }
    }

    // MARK: - Listes

    private var listsSection: some View {
        Section("Listes") {
            NavigationLink {
                CategoriesSettingsView()
            } label: {
                settingsRow("Catégories", symbol: "square.grid.2x2.fill", detail: "\(categories.count)")
            }

            NavigationLink {
                MerchantsSettingsView()
            } label: {
                settingsRow("Enseignes", symbol: "storefront.fill", detail: "\(merchants.count)")
            }

            NavigationLink {
                LabelsSettingsView(settings: settings)
            } label: {
                settingsRow("Types et statuts", symbol: "tag.fill", detail: "5")
            }
        }
        .listRowBackground(Palette.surface)
    }

    // MARK: - Récurrentes

    private var recurringSection: some View {
        Section {
            NavigationLink {
                RecurringSettingsView()
            } label: {
                settingsRow(
                    "Dépenses récurrentes",
                    symbol: "arrow.triangle.2.circlepath",
                    detail: "\(recurring.filter(\.isActive).count)"
                )
            }
        } footer: {
            Text("Les récurrentes fournissent le montant prévu, alimentent le rappel du mois en cours et pré-remplissent la saisie.")
        }
        .listRowBackground(Palette.surface)
    }

    // MARK: - Apparence

    private var appearanceSection: some View {
        Section("Apparence") {
            Picker(selection: Binding(
                get: { settings.theme },
                set: { newValue in
                    Haptics.selection()
                    settings.theme = newValue
                    context.saveChanges()
                }
            )) {
                ForEach(AppTheme.allCases) { theme in
                    Label(theme.label, systemImage: theme.symbol).tag(theme)
                }
            } label: {
                Label("Thème", systemImage: "paintbrush.fill")
            }
            .pickerStyle(.navigationLink)
        }
        .listRowBackground(Palette.surface)
    }

    // MARK: - Données

    private var dataSection: some View {
        Section {
            Button {
                Haptics.tap()
                showExportOptions = true
            } label: {
                settingsRow("Exporter en CSV", symbol: "square.and.arrow.up", detail: "\(expenses.count) dépenses")
            }

            Button {
                Haptics.tap()
                showReseedConfirmation = true
            } label: {
                settingsRow("Recharger les données de démonstration", symbol: "wand.and.stars")
            }

            Button(role: .destructive) {
                Haptics.warning()
                showResetConfirmation = true
            } label: {
                Label("Tout effacer", systemImage: "trash.fill")
                    .foregroundStyle(Palette.negative)
            }
        } header: {
            Text("Mes données")
        } footer: {
            Text("Toutes les données restent sur cet iPhone. Aucune connexion internet n'est nécessaire, et rien n'est envoyé à un serveur.")
        }
        .listRowBackground(Palette.surface)
        .confirmationDialog("Tout effacer ?", isPresented: $showResetConfirmation, titleVisibility: .visible) {
            Button("Tout effacer", role: .destructive) { wipe() }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Toutes vos dépenses, récurrentes et salaires seront supprimés définitivement. Pensez à exporter d'abord.")
        }
        .confirmationDialog("Recharger la démonstration ?", isPresented: $showReseedConfirmation, titleVisibility: .visible) {
            Button("Remplacer mes données", role: .destructive) { reseed() }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Vos données actuelles seront remplacées par le jeu d'exemple sur le mois en cours.")
        }
    }

    // MARK: - À propos

    private var aboutSection: some View {
        Section {
            NavigationLink {
                AboutView()
            } label: {
                settingsRow("À propos et limites", symbol: "info.circle.fill")
            }
        }
        .listRowBackground(Palette.surface)
    }

    // MARK: - Briques

    private func settingsRow(_ title: String, symbol: String, detail: String? = nil) -> some View {
        HStack {
            Label(title, systemImage: symbol)
                .foregroundStyle(Palette.textPrimary)
            Spacer()
            if let detail {
                Text(detail)
                    .font(.footnote)
                    .foregroundStyle(Palette.textTertiary)
                    .monospacedDigit()
            }
        }
    }

    // MARK: - Actions

    private func export(includeConfidential: Bool) {
        do {
            exportURL = try ExportService.writeCSV(
                expenses: expenses,
                settings: settings,
                includeConfidential: includeConfidential
            )
            Haptics.success()
        } catch {
            errorMessage = "L'export a échoué : \(error.localizedDescription)"
        }
    }

    private func wipe() {
        do {
            try SeedData.wipeAll(in: context)
            settings.didSeedDemoData = true
            context.saveChanges()
            Haptics.success()
        } catch {
            errorMessage = "La suppression a échoué : \(error.localizedDescription)"
        }
    }

    private func reseed() {
        do {
            try SeedData.wipeAll(in: context)
            SeedData.installDemoData(in: context)
            settings.didSeedDemoData = true
            context.saveChanges()
            Haptics.success()
        } catch {
            errorMessage = "Le rechargement a échoué : \(error.localizedDescription)"
        }
    }
}

// MARK: - Partage

/// Emballage `Identifiable` pour présenter la feuille de partage.
private struct ExportFile: Identifiable {
    let url: URL
    var id: String { url.absoluteString }
}

/// Feuille de partage système (`UIActivityViewController`).
struct ShareSheet: UIViewControllerRepresentable {

    let url: URL

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
