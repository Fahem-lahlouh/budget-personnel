import SwiftUI
import SwiftData

/// Saisie et modification d'une dépense.
///
/// Le chemin rapide tient en trois gestes : le montant est déjà au clavier à
/// l'ouverture, la catégorie se choisit d'un tap dans les pastilles, « Ajouter »
/// enregistre. Tout le reste (date, type, statut, budget prévu, remarque) est
/// disponible juste en dessous, sans être imposé.
struct ExpenseEditorView: View {

    enum Mode {
        case create(defaultDate: Date)
        case createFromRecurring(RecurringExpense, year: Int, month: Int)
        case edit(Expense)
    }

    let mode: Mode
    let settings: AppSettings

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @Query(sort: \CategoryItem.sortOrder) private var categories: [CategoryItem]
    @Query(sort: \MerchantItem.sortOrder) private var merchants: [MerchantItem]
    @Query(sort: \RecurringExpense.sortOrder) private var recurring: [RecurringExpense]

    // Brouillon local : rien n'est écrit en base avant « Enregistrer », ce qui
    // rend l'annulation réellement sans effet.
    @State private var amount: Double = 0
    @State private var date = Date()
    @State private var categoryName = ""
    @State private var merchantName = ""
    @State private var details = ""
    @State private var type: ExpenseType = .variable
    @State private var status: PaymentStatus = .paye
    @State private var plannedAmount: Double = 0
    @State private var hasPlannedAmount = false
    @State private var note = ""
    @State private var isConfidential = false
    @State private var recurringID: UUID?

    @State private var showAllOptions = false
    @State private var isPickingMerchant = false
    @State private var showDeleteConfirmation = false
    @State private var didLoad = false

    @FocusState private var isAmountFocused: Bool

    private var isEditing: Bool {
        if case .edit = mode { return true }
        return false
    }

    private var editedExpense: Expense? {
        if case .edit(let expense) = mode { return expense }
        return nil
    }

    private var canSave: Bool {
        amount > 0 && !categoryName.isEmpty
    }

    /// Écart affiché en direct pendant la saisie.
    private var variance: Double? {
        guard hasPlannedAmount, plannedAmount != 0 else { return nil }
        return amount - plannedAmount
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: Metrics.stackSpacing) {
                    amountCard
                    categoryCard
                    detailsCard

                    DisclosureGroup(isExpanded: $showAllOptions) {
                        VStack(spacing: 16) {
                            plannedSection
                            Divider().overlay(Palette.hairline)
                            noteSection
                        }
                        .padding(.top, 12)
                    } label: {
                        Text("Budget prévu, remarque, confidentialité")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Palette.accent)
                    }
                    .tint(Palette.accent)
                    .padding(Metrics.cardPadding)
                    .background {
                        RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous)
                            .fill(Palette.surface)
                    }
                    .overlay {
                        RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous)
                            .strokeBorder(Palette.hairline, lineWidth: 0.5)
                    }

                    if isEditing {
                        Button(role: .destructive) {
                            showDeleteConfirmation = true
                        } label: {
                            Label("Supprimer cette dépense", systemImage: "trash")
                                .font(.subheadline.weight(.semibold))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(
                                    RoundedRectangle(cornerRadius: Metrics.innerRadius, style: .continuous)
                                        .fill(Palette.negativeSoft)
                                )
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Palette.negative)
                    }
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.vertical, 12)
            }
            .scrollIndicators(.hidden)
            .background(Palette.background)
            .navigationTitle(isEditing ? "Modifier" : "Nouvelle dépense")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isEditing ? "Enregistrer" : "Ajouter") { save() }
                        .fontWeight(.semibold)
                        .disabled(!canSave)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("OK") { isAmountFocused = false }
                }
            }
            .sheet(isPresented: $isPickingMerchant) {
                NamePickerSheet(
                    title: "Enseigne",
                    names: merchants.map(\.name),
                    selection: $merchantName,
                    allowsNone: true
                )
            }
            .confirmationDialog(
                "Supprimer cette dépense ?",
                isPresented: $showDeleteConfirmation,
                titleVisibility: .visible
            ) {
                Button("Supprimer", role: .destructive) { deleteExpense() }
                Button("Annuler", role: .cancel) {}
            }
            .onAppear(perform: load)
        }
    }

    // MARK: - Montant

    private var amountCard: some View {
        Card {
            VStack(spacing: 10) {
                Text("Montant en euros")
                    .sectionLabelStyle()

                TextField("0", value: $amount, format: .number.precision(.fractionLength(0...2)))
                    .keyboardType(.decimalPad)
                    .focused($isAmountFocused)
                    .multilineTextAlignment(.center)
                    .font(.system(size: 46, weight: .semibold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(Palette.textPrimary)
                    .accessibilityLabel("Montant en euros")

                if let variance {
                    HStack(spacing: 5) {
                        Image(systemName: variance > 0 ? "arrow.up.right" : "arrow.down.right")
                            .font(.caption2.weight(.bold))
                        Text(variance > 0
                             ? "\(Fmt.money(variance)) au-dessus du budget"
                             : "\(Fmt.money(-variance)) sous le budget")
                            .font(.caption.weight(.semibold))
                    }
                    .foregroundStyle(variance > 0 ? Palette.negative : Palette.positive)
                    .transition(.opacity.combined(with: .move(edge: .top)))
                }
            }
            .frame(maxWidth: .infinity)
            .animation(Motion.quick, value: variance)
        }
    }

    // MARK: - Catégorie

    private var categoryCard: some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader("Catégorie")

                LazyVGrid(
                    columns: [GridItem(.adaptive(minimum: 104), spacing: 8)],
                    alignment: .leading,
                    spacing: 8
                ) {
                    ForEach(categories, id: \.name) { category in
                        categoryChip(category)
                    }
                }
            }
        }
    }

    private func categoryChip(_ category: CategoryItem) -> some View {
        let isOn = categoryName == category.name
        let tint = Palette.color(forName: category.name)

        return Button {
            Haptics.selection()
            withAnimation(Motion.quick) { categoryName = category.name }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: category.symbolName)
                    .font(.caption.weight(.semibold))
                Text(category.name)
                    .font(.footnote.weight(.medium))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .foregroundStyle(isOn ? .white : tint)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 10)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: Metrics.chipRadius, style: .continuous)
                    .fill(isOn ? AnyShapeStyle(tint) : AnyShapeStyle(tint.opacity(0.12)))
            )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(category.name)
        .accessibilityAddTraits(isOn ? [.isSelected] : [])
    }

    // MARK: - Détails

    private var detailsCard: some View {
        Card {
            VStack(spacing: 0) {
                fieldRow(symbol: "text.alignleft", title: "Description") {
                    TextField("Ex. Courses de la semaine", text: $details)
                        .multilineTextAlignment(.trailing)
                        .submitLabel(.done)
                        .onChange(of: details) { _, newValue in autofillPlanned(from: newValue) }
                }

                divider

                Button {
                    Haptics.tap()
                    isPickingMerchant = true
                } label: {
                    fieldRow(symbol: "storefront", title: "Enseigne") {
                        HStack(spacing: 4) {
                            Text(merchantName.isEmpty ? "Aucune" : merchantName)
                                .foregroundStyle(merchantName.isEmpty ? Palette.textTertiary : Palette.textPrimary)
                            Image(systemName: "chevron.right")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Palette.textTertiary)
                        }
                    }
                }
                .buttonStyle(.plain)

                divider

                fieldRow(symbol: "calendar", title: "Date") {
                    DatePicker("", selection: $date, displayedComponents: .date)
                        .labelsHidden()
                        .environment(\.locale, Fmt.locale)
                }

                divider

                VStack(alignment: .leading, spacing: 8) {
                    Text("Type").sectionLabelStyle()
                    Picker("Type", selection: $type) {
                        ForEach(ExpenseType.allCases) { value in
                            Text(settings.label(for: value)).tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.vertical, 12)

                divider

                VStack(alignment: .leading, spacing: 8) {
                    Text("Statut").sectionLabelStyle()
                    Picker("Statut", selection: $status) {
                        ForEach(PaymentStatus.allCases) { value in
                            Text(settings.label(for: value)).tag(value)
                        }
                    }
                    .pickerStyle(.segmented)
                }
                .padding(.vertical, 12)
            }
        }
        .onChange(of: type) { _, _ in Haptics.selection() }
        .onChange(of: status) { _, _ in Haptics.selection() }
    }

    // MARK: - Options avancées

    private var plannedSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: $hasPlannedAmount.animation(Motion.quick)) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Montant prévu")
                    Text("Permet de calculer l'écart avec le budget.")
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            .tint(Palette.accent)

            if hasPlannedAmount {
                AmountField(title: "Budget", value: $plannedAmount, symbol: "target", tint: Palette.accent)
                    .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    private var noteSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 6) {
                Text("Remarque").sectionLabelStyle()
                TextField("Optionnel", text: $note, axis: .vertical)
                    .lineLimit(1...4)
                    .padding(12)
                    .background(
                        RoundedRectangle(cornerRadius: Metrics.innerRadius, style: .continuous)
                            .fill(Palette.surfaceRaised)
                    )
            }

            Toggle(isOn: $isConfidential) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Confidentiel")
                    Text("Le montant reste masqué même une fois l'app déverrouillée.")
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            .tint(Palette.accent)
        }
    }

    // MARK: - Briques

    private var divider: some View {
        Divider().overlay(Palette.hairline)
    }

    private func fieldRow<Content: View>(
        symbol: String,
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        HStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Palette.textSecondary)
                .frame(width: 22)

            Text(title)
                .foregroundStyle(Palette.textPrimary)

            Spacer(minLength: 8)

            content()
        }
        .padding(.vertical, 12)
    }

    // MARK: - Chargement & enregistrement

    private func load() {
        guard !didLoad else { return }
        didLoad = true

        switch mode {
        case .create(let defaultDate):
            date = defaultDate
            categoryName = ""
            // Le clavier s'ouvre sur le montant : c'est la première chose à
            // saisir, et le reste peut souvent rester tel quel.
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { isAmountFocused = true }

        case .createFromRecurring(let item, let year, let month):
            date = item.dueDate(year: year, month: month)
            categoryName = item.categoryName
            merchantName = item.merchantName
            details = item.details
            amount = item.plannedAmount
            type = item.type
            status = .paye
            plannedAmount = item.plannedAmount
            hasPlannedAmount = true
            note = item.note
            isConfidential = item.isConfidential
            recurringID = item.uid

        case .edit(let expense):
            date = expense.date
            categoryName = expense.categoryName
            merchantName = expense.merchantName
            details = expense.details
            amount = expense.amount
            type = expense.type
            status = expense.status
            plannedAmount = expense.plannedAmount ?? 0
            hasPlannedAmount = expense.plannedAmount != nil
            note = expense.note
            isConfidential = expense.isConfidential
            recurringID = expense.recurringID
            showAllOptions = hasPlannedAmount || !expense.note.isEmpty || expense.isConfidential
        }
    }

    /// Reprend le montant prévu d'une récurrente dès que la description
    /// correspond — c'est le RECHERCHEV du classeur, en direct.
    private func autofillPlanned(from newDetails: String) {
        guard !hasPlannedAmount || plannedAmount == 0 else { return }
        guard let planned = BudgetEngine.plannedAmount(forDetails: newDetails, in: recurring) else { return }
        withAnimation(Motion.quick) {
            plannedAmount = planned
            hasPlannedAmount = true
        }
    }

    private func save() {
        guard canSave else { return }

        let trimmedDetails = details.trimmingCharacters(in: .whitespacesAndNewlines)
        let planned: Double? = hasPlannedAmount && plannedAmount > 0 ? plannedAmount : nil

        if let expense = editedExpense {
            expense.date = date
            expense.categoryName = categoryName
            expense.merchantName = merchantName
            expense.details = trimmedDetails
            expense.amount = amount
            expense.type = type
            expense.status = status
            expense.plannedAmount = planned
            expense.note = note.trimmingCharacters(in: .whitespacesAndNewlines)
            expense.isConfidential = isConfidential
            expense.recurringID = recurringID
        } else {
            context.insert(Expense(
                date: date,
                categoryName: categoryName,
                merchantName: merchantName,
                details: trimmedDetails,
                amount: amount,
                type: type,
                plannedAmount: planned,
                status: status,
                note: note.trimmingCharacters(in: .whitespacesAndNewlines),
                isConfidential: isConfidential,
                recurringID: recurringID
            ))
        }

        context.saveChanges()
        Haptics.success()
        dismiss()
    }

    private func deleteExpense() {
        guard let expense = editedExpense else { return }
        context.delete(expense)
        context.saveChanges()
        Haptics.warning()
        dismiss()
    }
}

// MARK: - Sélecteur de nom

/// Feuille de sélection avec recherche, utilisée pour les enseignes.
struct NamePickerSheet: View {

    let title: String
    let names: [String]
    @Binding var selection: String
    var allowsNone = false

    @Environment(\.dismiss) private var dismiss
    @State private var search = ""

    private var filtered: [String] {
        let needle = search.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !needle.isEmpty else { return names }
        return names.filter { $0.localizedCaseInsensitiveContains(needle) }
    }

    var body: some View {
        NavigationStack {
            List {
                if allowsNone {
                    row(name: "", label: "Aucune")
                }
                ForEach(filtered, id: \.self) { name in
                    row(name: name, label: name)
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(Palette.background)
            .searchable(text: $search, prompt: "Rechercher")
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func row(name: String, label: String) -> some View {
        Button {
            Haptics.selection()
            selection = name
            dismiss()
        } label: {
            HStack {
                Text(label)
                    .foregroundStyle(name.isEmpty ? Palette.textSecondary : Palette.textPrimary)
                Spacer()
                if selection == name {
                    Image(systemName: "checkmark")
                        .font(.footnote.weight(.bold))
                        .foregroundStyle(Palette.accent)
                }
            }
        }
        .listRowBackground(Palette.surface)
    }
}
