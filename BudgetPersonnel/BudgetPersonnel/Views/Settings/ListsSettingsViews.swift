import SwiftUI
import SwiftData

// MARK: - Catégories

/// Gestion des catégories : ajout, renommage, suppression, réordonnancement.
///
/// Renommer une catégorie met à jour les dépenses et les récurrentes qui la
/// référencent — sans quoi l'historique se retrouverait rattaché à un nom qui
/// n'existe plus.
struct CategoriesSettingsView: View {

    @Environment(\.modelContext) private var context
    @Query(sort: \CategoryItem.sortOrder) private var categories: [CategoryItem]
    @Query private var expenses: [Expense]
    @Query private var recurring: [RecurringExpense]

    @State private var newName = ""
    @State private var renaming: CategoryItem?
    @State private var renameText = ""
    @State private var errorMessage: String?

    @FocusState private var isAddFocused: Bool

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    TextField("Nouvelle catégorie", text: $newName)
                        .focused($isAddFocused)
                        .submitLabel(.done)
                        .onSubmit(add)

                    Button(action: add) {
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                            .foregroundStyle(canAdd ? Palette.accent : Palette.textTertiary)
                    }
                    .buttonStyle(.plain)
                    .disabled(!canAdd)
                    .accessibilityLabel("Ajouter la catégorie")
                }
            }
            .listRowBackground(Palette.surface)

            Section {
                ForEach(categories, id: \.persistentModelID) { category in
                    row(category)
                }
                .onDelete(perform: delete)
                .onMove(perform: move)
            } header: {
                Text("\(categories.count) catégorie\(categories.count > 1 ? "s" : "")")
            } footer: {
                Text("Supprimer une catégorie ne supprime pas les dépenses qui l'utilisent : elles conservent leur libellé.")
            }
            .listRowBackground(Palette.surface)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Palette.background)
        .navigationTitle("Catégories")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { EditButton() }
        .alert("Renommer", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Nom", text: $renameText)
            Button("Annuler", role: .cancel) { renaming = nil }
            Button("Renommer") { commitRename() }
        }
        .alert("Impossible", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var canAdd: Bool {
        !newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func row(_ category: CategoryItem) -> some View {
        let usage = expenses.filter { $0.categoryName == category.name }.count

        return Button {
            Haptics.tap()
            renameText = category.name
            renaming = category
        } label: {
            HStack(spacing: 12) {
                Image(systemName: category.symbolName)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.color(forName: category.name))
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Palette.color(forName: category.name).opacity(0.14)))

                Text(category.name)
                    .foregroundStyle(Palette.textPrimary)

                Spacer()

                if usage > 0 {
                    Text("\(usage)")
                        .font(.caption)
                        .foregroundStyle(Palette.textTertiary)
                        .monospacedDigit()
                }
            }
        }
        .buttonStyle(.plain)
    }

    // MARK: Actions

    private func add() {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        guard !categories.contains(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) else {
            errorMessage = "« \(name) » existe déjà."
            return
        }
        let order = (categories.map(\.sortOrder).max() ?? -1) + 1
        context.insert(CategoryItem(name: name, sortOrder: order))
        context.saveChanges()
        newName = ""
        Haptics.success()
    }

    private func commitRename() {
        guard let category = renaming else { return }
        let name = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        renaming = nil

        guard !name.isEmpty, name != category.name else { return }
        guard !categories.contains(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) else {
            errorMessage = "« \(name) » existe déjà."
            return
        }

        let oldName = category.name
        category.name = name
        // Report du nouveau nom sur l'historique.
        for expense in expenses where expense.categoryName == oldName {
            expense.categoryName = name
        }
        for item in recurring where item.categoryName == oldName {
            item.categoryName = name
        }
        context.saveChanges()
        Haptics.success()
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets { context.delete(categories[index]) }
        context.saveChanges()
        Haptics.warning()
    }

    private func move(from source: IndexSet, to destination: Int) {
        var ordered = categories
        ordered.move(fromOffsets: source, toOffset: destination)
        for (index, item) in ordered.enumerated() { item.sortOrder = index }
        context.saveChanges()
    }
}

// MARK: - Enseignes

/// Gestion des enseignes. Même logique que les catégories.
struct MerchantsSettingsView: View {

    @Environment(\.modelContext) private var context
    @Query(sort: \MerchantItem.sortOrder) private var merchants: [MerchantItem]
    @Query private var expenses: [Expense]
    @Query private var recurring: [RecurringExpense]

    @State private var newName = ""
    @State private var renaming: MerchantItem?
    @State private var renameText = ""
    @State private var errorMessage: String?

    var body: some View {
        List {
            Section {
                HStack(spacing: 10) {
                    TextField("Nouvelle enseigne", text: $newName)
                        .submitLabel(.done)
                        .onSubmit(add)

                    Button(action: add) {
                        Image(systemName: "plus.circle.fill")
                            .font(.title3)
                            .foregroundStyle(canAdd ? Palette.accent : Palette.textTertiary)
                    }
                    .buttonStyle(.plain)
                    .disabled(!canAdd)
                    .accessibilityLabel("Ajouter l'enseigne")
                }
            }
            .listRowBackground(Palette.surface)

            Section {
                ForEach(merchants, id: \.persistentModelID) { merchant in
                    row(merchant)
                }
                .onDelete(perform: delete)
                .onMove(perform: move)
            } header: {
                Text("\(merchants.count) enseigne\(merchants.count > 1 ? "s" : "")")
            }
            .listRowBackground(Palette.surface)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Palette.background)
        .navigationTitle("Enseignes")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { EditButton() }
        .alert("Renommer", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
            TextField("Nom", text: $renameText)
            Button("Annuler", role: .cancel) { renaming = nil }
            Button("Renommer") { commitRename() }
        }
        .alert("Impossible", isPresented: Binding(get: { errorMessage != nil }, set: { if !$0 { errorMessage = nil } })) {
            Button("OK") { errorMessage = nil }
        } message: {
            Text(errorMessage ?? "")
        }
    }

    private var canAdd: Bool {
        !newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private func row(_ merchant: MerchantItem) -> some View {
        let usage = expenses.filter { $0.merchantName == merchant.name }.count

        return Button {
            Haptics.tap()
            renameText = merchant.name
            renaming = merchant
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "storefront.fill")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Palette.color(forName: merchant.name))
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Palette.color(forName: merchant.name).opacity(0.14)))

                Text(merchant.name)
                    .foregroundStyle(Palette.textPrimary)

                Spacer()

                if usage > 0 {
                    Text("\(usage)")
                        .font(.caption)
                        .foregroundStyle(Palette.textTertiary)
                        .monospacedDigit()
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func add() {
        let name = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        guard !merchants.contains(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) else {
            errorMessage = "« \(name) » existe déjà."
            return
        }
        let order = (merchants.map(\.sortOrder).max() ?? -1) + 1
        context.insert(MerchantItem(name: name, sortOrder: order))
        context.saveChanges()
        newName = ""
        Haptics.success()
    }

    private func commitRename() {
        guard let merchant = renaming else { return }
        let name = renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        renaming = nil

        guard !name.isEmpty, name != merchant.name else { return }
        guard !merchants.contains(where: { $0.name.caseInsensitiveCompare(name) == .orderedSame }) else {
            errorMessage = "« \(name) » existe déjà."
            return
        }

        let oldName = merchant.name
        merchant.name = name
        for expense in expenses where expense.merchantName == oldName {
            expense.merchantName = name
        }
        for item in recurring where item.merchantName == oldName {
            item.merchantName = name
        }
        context.saveChanges()
        Haptics.success()
    }

    private func delete(at offsets: IndexSet) {
        for index in offsets { context.delete(merchants[index]) }
        context.saveChanges()
        Haptics.warning()
    }

    private func move(from source: IndexSet, to destination: Int) {
        var ordered = merchants
        ordered.move(fromOffsets: source, toOffset: destination)
        for (index, item) in ordered.enumerated() { item.sortOrder = index }
        context.saveChanges()
    }
}

// MARK: - Types et statuts

/// Libellés des types et des statuts.
///
/// Ces deux listes ne sont **pas** extensibles, et l'écran le dit franchement :
/// les trois types et les deux statuts pilotent les calculs (répartition,
/// prévisions, rappels). En ajouter un quatrième nécessiterait de redéfinir ce
/// que l'app doit en faire. Leur libellé, lui, est libre.
struct LabelsSettingsView: View {

    let settings: AppSettings

    @Environment(\.modelContext) private var context

    var body: some View {
        List {
            Section {
                ForEach(ExpenseType.allCases) { type in
                    labelRow(
                        symbol: type.symbol,
                        tint: type.tint,
                        text: Binding(
                            get: { settings.label(for: type) },
                            set: { settings.setLabel($0, for: type); context.saveChanges() }
                        ),
                        placeholder: type.defaultLabel
                    )
                }
            } header: {
                Text("Types")
            } footer: {
                Text("Trois types, figés : ils pilotent la répartition Fixe / Variable / Exceptionnel des analyses. Vous pouvez renommer chacun d'eux.")
            }
            .listRowBackground(Palette.surface)

            Section {
                ForEach(PaymentStatus.allCases) { status in
                    labelRow(
                        symbol: status.symbol,
                        tint: status.tint,
                        text: Binding(
                            get: { settings.label(for: status) },
                            set: { settings.setLabel($0, for: status); context.saveChanges() }
                        ),
                        placeholder: status.defaultLabel
                    )
                }
            } header: {
                Text("Statuts")
            } footer: {
                Text("Deux statuts, figés : ils déterminent le rappel des dépenses à payer et la répartition Payé / À payer.")
            }
            .listRowBackground(Palette.surface)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Palette.background)
        .navigationTitle("Types et statuts")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func labelRow(symbol: String, tint: Color, text: Binding<String>, placeholder: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(tint)
                .frame(width: 30, height: 30)
                .background(Circle().fill(tint.opacity(0.14)))

            TextField(placeholder, text: text)
                .foregroundStyle(Palette.textPrimary)
        }
    }
}
