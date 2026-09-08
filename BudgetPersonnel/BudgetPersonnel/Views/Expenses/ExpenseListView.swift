import SwiftUI
import SwiftData

/// Liste des dépenses du mois : recherche, filtres, balayage pour supprimer.
struct ExpenseListView: View {

    @Binding var selection: MonthSelection
    let settings: AppSettings

    @State private var search = ""
    @State private var typeFilter: ExpenseType?
    @State private var statusFilter: PaymentStatus?
    @State private var isAdding = false

    var body: some View {
        NavigationStack {
            MonthExpenseList(
                year: selection.year,
                month: selection.month,
                settings: settings,
                search: search,
                typeFilter: typeFilter,
                statusFilter: statusFilter,
                onAdd: { isAdding = true }
            )
            .id("\(selection.year)-\(selection.month)")
            .background(Palette.background)
            .navigationTitle("Dépenses")
            .navigationBarTitleDisplayMode(.large)
            .searchable(text: $search, prompt: "Rechercher une dépense, une enseigne…")
            .safeAreaInset(edge: .top, spacing: 0) {
                VStack(spacing: 10) {
                    MonthSwitcher(selection: $selection)
                    FilterBar(typeFilter: $typeFilter, statusFilter: $statusFilter, settings: settings)
                }
                .background(Palette.background)
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { PrivacyToggleButton() }
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Haptics.tap()
                        isAdding = true
                    } label: {
                        Label("Ajouter", systemImage: "plus")
                    }
                    .accessibilityLabel("Ajouter une dépense")
                }
            }
            .sheet(isPresented: $isAdding) {
                ExpenseEditorView(mode: .create(defaultDate: selection.defaultDateForNewExpense), settings: settings)
            }
        }
    }
}

// MARK: - Liste

/// Liste effective, avec sa requête bornée au mois affiché.
private struct MonthExpenseList: View {

    let settings: AppSettings
    let search: String
    let typeFilter: ExpenseType?
    let statusFilter: PaymentStatus?
    let onAdd: () -> Void

    @Query private var expenses: [Expense]
    @Environment(\.modelContext) private var context

    @State private var editing: Expense?
    @State private var pendingDeletion: Expense?

    private let month: Int

    init(
        year: Int,
        month: Int,
        settings: AppSettings,
        search: String,
        typeFilter: ExpenseType?,
        statusFilter: PaymentStatus?,
        onAdd: @escaping () -> Void
    ) {
        self.month = month
        self.settings = settings
        self.search = search
        self.typeFilter = typeFilter
        self.statusFilter = statusFilter
        self.onAdd = onAdd

        let range = MonthRange(year: year, month: month)
        let start = range.start
        let end = range.end
        _expenses = Query(
            filter: #Predicate<Expense> { $0.date >= start && $0.date < end },
            sort: [SortDescriptor(\Expense.date, order: .reverse),
                   SortDescriptor(\Expense.createdAt, order: .reverse)]
        )
    }

    /// Filtrage en mémoire : la liste d'un mois tient largement en RAM, et cela
    /// évite de reconstruire une requête à chaque frappe dans la recherche.
    private var filtered: [Expense] {
        let needle = search.trimmingCharacters(in: .whitespacesAndNewlines)
        return expenses.filter { expense in
            if let typeFilter, expense.type != typeFilter { return false }
            if let statusFilter, expense.status != statusFilter { return false }
            guard !needle.isEmpty else { return true }
            return [expense.details, expense.categoryName, expense.merchantName, expense.note]
                .contains { $0.localizedCaseInsensitiveContains(needle) }
        }
    }

    /// Dépenses regroupées par jour, du plus récent au plus ancien.
    private var groups: [(date: Date, items: [Expense])] {
        let cal = Calendar.budget
        let grouped = Dictionary(grouping: filtered) { cal.startOfDay(for: $0.date) }
        return grouped
            .map { (date: $0.key, items: $0.value) }
            .sorted { $0.date > $1.date }
    }

    private var total: Double { filtered.reduce(0) { $0 + $1.amount } }

    var body: some View {
        // `List` (et non un `ScrollView`) : c'est lui qui apporte les gestes
        // natifs de balayage, l'accessibilité des lignes et le recyclage des
        // cellules. Le style « inset grouped » donne les sections arrondies.
        List {
            if filtered.isEmpty {
                Section {
                    emptyState
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            } else {
                Section {
                    totalCard
                        .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                        .listRowBackground(Palette.surface)
                }

                ForEach(groups, id: \.date) { group in
                    Section {
                        ForEach(group.items, id: \.persistentModelID) { expense in
                            Button {
                                Haptics.tap()
                                editing = expense
                            } label: {
                                ExpenseRow(expense: expense, settings: settings)
                            }
                            .buttonStyle(.plain)
                            .listRowBackground(Palette.surface)
                            .listRowInsets(EdgeInsets(top: 10, leading: 16, bottom: 10, trailing: 16))
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    pendingDeletion = expense
                                } label: {
                                    Label("Supprimer", systemImage: "trash")
                                }
                            }
                            .swipeActions(edge: .leading, allowsFullSwipe: true) {
                                Button {
                                    toggleStatus(expense)
                                } label: {
                                    Label(
                                        expense.status == .paye ? "À payer" : "Payé",
                                        systemImage: expense.status == .paye ? "clock" : "checkmark"
                                    )
                                }
                                .tint(expense.status == .paye ? Palette.warning : Palette.positive)
                            }
                            .contextMenu {
                                Button {
                                    toggleStatus(expense)
                                } label: {
                                    Label(
                                        expense.status == .paye ? "Marquer à payer" : "Marquer payée",
                                        systemImage: expense.status == .paye ? "clock" : "checkmark.circle"
                                    )
                                }
                                Button(role: .destructive) {
                                    pendingDeletion = expense
                                } label: {
                                    Label("Supprimer", systemImage: "trash")
                                }
                            }
                        }
                    } header: {
                        dayHeader(group)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Palette.background)
        .scrollDismissesKeyboard(.immediately)
        .sheet(item: $editing) { expense in
            ExpenseEditorView(mode: .edit(expense), settings: settings)
        }
        .confirmationDialog(
            "Supprimer cette dépense ?",
            isPresented: Binding(get: { pendingDeletion != nil }, set: { if !$0 { pendingDeletion = nil } }),
            titleVisibility: .visible
        ) {
            Button("Supprimer", role: .destructive) {
                if let expense = pendingDeletion { delete(expense) }
                pendingDeletion = nil
            }
            Button("Annuler", role: .cancel) { pendingDeletion = nil }
        } message: {
            if let expense = pendingDeletion {
                Text("« \(expense.details) » sera définitivement supprimée.")
            }
        }
    }

    private var totalCard: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("\(filtered.count) dépense\(filtered.count > 1 ? "s" : "")")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Palette.textPrimary)
                Text(search.isEmpty && typeFilter == nil && statusFilter == nil
                     ? "Total du mois"
                     : "Total filtré")
                    .font(.caption)
                    .foregroundStyle(Palette.textSecondary)
            }
            Spacer()
            AmountText(value: total, style: .tile)
        }
        .accessibilityElement(children: .combine)
    }

    private func dayHeader(_ group: (date: Date, items: [Expense])) -> some View {
        HStack {
            Text(Fmt.longDate(group.date))
                .sectionLabelStyle()
            Spacer()
            AmountText(
                value: group.items.reduce(0) { $0 + $1.amount },
                style: .caption,
                tint: Palette.textSecondary
            )
        }
        .textCase(nil)
        .padding(.bottom, 2)
    }

    private var emptyState: some View {
        let isFiltering = !search.isEmpty || typeFilter != nil || statusFilter != nil
        // Rien à proposer quand la liste est vide à cause d'un filtre : le
        // bouton « Ajouter » n'y changerait rien, c'est le filtre qu'il faut
        // relâcher.
        let title: String? = isFiltering ? nil : "Ajouter une dépense"
        let handler: (() -> Void)? = isFiltering ? nil : onAdd

        return EmptyStateView(
            symbol: isFiltering ? "line.3.horizontal.decrease.circle" : "tray",
            title: isFiltering ? "Aucun résultat" : "Aucune dépense en \(Fmt.monthName(month).lowercased())",
            message: isFiltering
                ? "Aucune dépense de ce mois ne correspond à votre recherche ou à vos filtres."
                : "Ajoutez votre première dépense : les indicateurs et les graphiques se remplissent aussitôt.",
            actionTitle: title,
            action: handler
        )
    }

    // MARK: Actions

    private func toggleStatus(_ expense: Expense) {
        Haptics.success()
        withAnimation(Motion.quick) {
            expense.status = expense.status == .paye ? .aPayer : .paye
        }
        context.saveChanges()
    }

    private func delete(_ expense: Expense) {
        Haptics.warning()
        withAnimation(Motion.spring) {
            context.delete(expense)
        }
        context.saveChanges()
    }
}

// MARK: - Barre de filtres

/// Filtres rapides par type et par statut.
private struct FilterBar: View {

    @Binding var typeFilter: ExpenseType?
    @Binding var statusFilter: PaymentStatus?
    let settings: AppSettings

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                chip(
                    label: "Tout",
                    isOn: typeFilter == nil && statusFilter == nil,
                    tint: Palette.accent
                ) {
                    typeFilter = nil
                    statusFilter = nil
                }

                ForEach(PaymentStatus.allCases) { status in
                    chip(
                        label: settings.label(for: status),
                        symbol: status.symbol,
                        isOn: statusFilter == status,
                        tint: status.tint
                    ) {
                        statusFilter = statusFilter == status ? nil : status
                    }
                }

                ForEach(ExpenseType.allCases) { type in
                    chip(
                        label: settings.label(for: type),
                        symbol: type.symbol,
                        isOn: typeFilter == type,
                        tint: type.tint
                    ) {
                        typeFilter = typeFilter == type ? nil : type
                    }
                }
            }
            .padding(.horizontal, Metrics.gutter)
        }
        .scrollIndicators(.hidden)
        .padding(.bottom, 8)
    }

    private func chip(
        label: String,
        symbol: String? = nil,
        isOn: Bool,
        tint: Color,
        action: @escaping () -> Void
    ) -> some View {
        Button {
            Haptics.selection()
            withAnimation(Motion.quick) { action() }
        } label: {
            HStack(spacing: 5) {
                if let symbol {
                    Image(systemName: symbol).font(.caption2.weight(.semibold))
                }
                Text(label).font(.footnote.weight(.semibold))
            }
            .foregroundStyle(isOn ? .white : tint)
            .padding(.horizontal, 13)
            .padding(.vertical, 8)
            .background(
                Capsule().fill(isOn ? AnyShapeStyle(tint) : AnyShapeStyle(tint.opacity(0.12)))
            )
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isSelected] : [])
    }
}
