import SwiftUI
import SwiftData

/// Gestion des dépenses récurrentes.
struct RecurringSettingsView: View {

    @Environment(\.modelContext) private var context

    @Query(sort: [SortDescriptor(\RecurringExpense.dayOfMonth),
                  SortDescriptor(\RecurringExpense.sortOrder)])
    private var recurring: [RecurringExpense]

    @State private var editing: RecurringExpense?
    @State private var isCreating = false

    private var active: [RecurringExpense] { recurring.filter(\.isActive) }
    private var inactive: [RecurringExpense] { recurring.filter { !$0.isActive } }

    private var monthlyTotal: Double {
        active.reduce(0) { $0 + $1.plannedAmount }
    }

    var body: some View {
        List {
            if recurring.isEmpty {
                Section {
                    EmptyStateView(
                        symbol: "arrow.triangle.2.circlepath",
                        title: "Aucune récurrente",
                        message: "Ajoutez vos dépenses qui reviennent chaque mois : loyer, crédit, abonnements, assurances…",
                        actionTitle: "Ajouter une récurrente",
                        action: { isCreating = true }
                    )
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                }
            } else {
                Section {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Total mensuel prévu")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(Palette.textPrimary)
                            Text("\(active.count) récurrente\(active.count > 1 ? "s" : "") active\(active.count > 1 ? "s" : "")")
                                .font(.caption)
                                .foregroundStyle(Palette.textSecondary)
                        }
                        Spacer()
                        AmountText(value: monthlyTotal, style: .tile)
                    }
                    .accessibilityElement(children: .combine)
                }
                .listRowBackground(Palette.surface)

                if !active.isEmpty {
                    Section("Actives") {
                        ForEach(active, id: \.persistentModelID) { row($0) }
                    }
                    .listRowBackground(Palette.surface)
                }

                if !inactive.isEmpty {
                    Section("Désactivées") {
                        ForEach(inactive, id: \.persistentModelID) { row($0) }
                    }
                    .listRowBackground(Palette.surface)
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Palette.background)
        .navigationTitle("Récurrentes")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    Haptics.tap()
                    isCreating = true
                } label: {
                    Label("Ajouter", systemImage: "plus")
                }
                .accessibilityLabel("Ajouter une récurrente")
            }
        }
        .sheet(isPresented: $isCreating) {
            RecurringEditorView(recurring: nil)
        }
        .sheet(item: $editing) { item in
            RecurringEditorView(recurring: item)
        }
    }

    private func row(_ item: RecurringExpense) -> some View {
        Button {
            Haptics.tap()
            editing = item
        } label: {
            HStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Palette.color(forName: item.categoryName).opacity(0.14))
                        .frame(width: 36, height: 36)
                    Text("\(item.dayOfMonth)")
                        .font(.caption.weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(Palette.color(forName: item.categoryName))
                }

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.details)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(item.isActive ? Palette.textPrimary : Palette.textTertiary)
                        .lineLimit(1)
                    Text(item.categoryName)
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                }

                Spacer(minLength: 8)

                AmountText(
                    value: item.plannedAmount,
                    style: .row,
                    isConfidential: item.isConfidential,
                    tint: item.isActive ? Palette.textPrimary : Palette.textTertiary
                )
            }
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            Button(role: .destructive) {
                context.delete(item)
                context.saveChanges()
                Haptics.warning()
            } label: {
                Label("Supprimer", systemImage: "trash")
            }

            Button {
                item.isActive.toggle()
                context.saveChanges()
                Haptics.selection()
            } label: {
                Label(item.isActive ? "Désactiver" : "Activer",
                      systemImage: item.isActive ? "pause.circle" : "play.circle")
            }
            .tint(Palette.warning)
        }
    }
}

// MARK: - Éditeur

/// Création ou modification d'une dépense récurrente.
struct RecurringEditorView: View {

    /// `nil` pour une création.
    let recurring: RecurringExpense?

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @Query(sort: \CategoryItem.sortOrder) private var categories: [CategoryItem]
    @Query(sort: \MerchantItem.sortOrder) private var merchants: [MerchantItem]
    @Query private var allRecurring: [RecurringExpense]

    @State private var details = ""
    @State private var categoryName = ""
    @State private var merchantName = ""
    @State private var amount: Double = 0
    @State private var day = 1
    @State private var type: ExpenseType = .fixe
    @State private var note = ""
    @State private var isConfidential = false
    @State private var isActive = true
    @State private var didLoad = false

    private var canSave: Bool {
        amount > 0
            && !categoryName.isEmpty
            && !details.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Description (ex. Loyer)", text: $details)

                    Picker("Catégorie", selection: $categoryName) {
                        Text("Choisir").tag("")
                        ForEach(categories, id: \.name) { category in
                            Text(category.name).tag(category.name)
                        }
                    }

                    Picker("Enseigne", selection: $merchantName) {
                        Text("Aucune").tag("")
                        ForEach(merchants, id: \.name) { merchant in
                            Text(merchant.name).tag(merchant.name)
                        }
                    }
                }
                .listRowBackground(Palette.surface)

                Section {
                    AmountField(title: "Montant prévu", value: $amount, symbol: "target", tint: Palette.accent)

                    Picker("Jour du mois", selection: $day) {
                        ForEach(1...31, id: \.self) { value in
                            Text("\(value)").tag(value)
                        }
                    }

                    Picker("Type", selection: $type) {
                        ForEach(ExpenseType.allCases) { value in
                            Text(value.defaultLabel).tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                } footer: {
                    Text("Si le jour choisi n'existe pas dans un mois (le 31 en février), l'échéance est ramenée au dernier jour du mois.")
                }
                .listRowBackground(Palette.surface)

                Section {
                    TextField("Remarque (optionnel)", text: $note, axis: .vertical)
                        .lineLimit(1...3)

                    Toggle("Confidentiel", isOn: $isConfidential)
                        .tint(Palette.accent)

                    Toggle("Active", isOn: $isActive)
                        .tint(Palette.accent)
                } footer: {
                    Text("Une récurrente désactivée ne génère plus de rappel et ne fournit plus de montant prévu, mais reste dans la liste.")
                }
                .listRowBackground(Palette.surface)

                if recurring != nil {
                    Section {
                        Button(role: .destructive) { deleteItem() } label: {
                            Label("Supprimer", systemImage: "trash")
                                .foregroundStyle(Palette.negative)
                        }
                    }
                    .listRowBackground(Palette.surface)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Palette.background)
            .navigationTitle(recurring == nil ? "Nouvelle récurrente" : "Modifier")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { save() }
                        .fontWeight(.semibold)
                        .disabled(!canSave)
                }
            }
            .onAppear(perform: load)
        }
    }

    private func load() {
        guard !didLoad else { return }
        didLoad = true
        guard let item = recurring else {
            categoryName = categories.first?.name ?? ""
            return
        }
        details = item.details
        categoryName = item.categoryName
        merchantName = item.merchantName
        amount = item.plannedAmount
        day = item.dayOfMonth
        type = item.type
        note = item.note
        isConfidential = item.isConfidential
        isActive = item.isActive
    }

    private func save() {
        guard canSave else { return }
        let trimmed = details.trimmingCharacters(in: .whitespacesAndNewlines)

        if let item = recurring {
            item.details = trimmed
            item.categoryName = categoryName
            item.merchantName = merchantName
            item.plannedAmount = amount
            item.dayOfMonth = day
            item.type = type
            item.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
            item.isConfidential = isConfidential
            item.isActive = isActive
        } else {
            let order = (allRecurring.map(\.sortOrder).max() ?? -1) + 1
            context.insert(RecurringExpense(
                categoryName: categoryName,
                merchantName: merchantName,
                details: trimmed,
                plannedAmount: amount,
                dayOfMonth: day,
                type: type,
                note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                isConfidential: isConfidential,
                isActive: isActive,
                sortOrder: order
            ))
        }

        context.saveChanges()
        Haptics.success()
        dismiss()
    }

    private func deleteItem() {
        guard let item = recurring else { return }
        context.delete(item)
        context.saveChanges()
        Haptics.warning()
        dismiss()
    }
}
