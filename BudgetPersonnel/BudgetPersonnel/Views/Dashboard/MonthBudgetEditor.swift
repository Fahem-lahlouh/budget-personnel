import SwiftUI
import SwiftData

/// Saisie du salaire et de l'objectif d'épargne d'un mois.
struct MonthBudgetEditor: View {

    let year: Int
    let month: Int

    @Environment(\.modelContext) private var context
    @Environment(\.dismiss) private var dismiss

    @Query private var budgets: [MonthBudget]
    @Query private var allBudgets: [MonthBudget]

    @State private var salary: Double = 0
    @State private var goal: Double = 0
    @State private var applyToFollowingMonths = false
    @State private var didLoad = false

    @FocusState private var focus: Field?

    private enum Field { case salary, goal }

    init(year: Int, month: Int) {
        self.year = year
        self.month = month
        let key = MonthBudget.key(year: year, month: month)
        _budgets = Query(filter: #Predicate<MonthBudget> { $0.key == key })
        _allBudgets = Query()
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    AmountField(title: "Salaire net du mois", value: $salary, symbol: "eurosign.circle.fill", tint: Palette.accent)
                        .focused($focus, equals: .salary)

                    AmountField(title: "Objectif d'épargne", value: $goal, symbol: "target", tint: Palette.positive)
                        .focused($focus, equals: .goal)
                } header: {
                    Text(Fmt.monthName(month) + " \(year)")
                } footer: {
                    Text("Le salaire sert de base à la jauge de consommation, au reste disponible et à l'épargne réelle.")
                }

                Section {
                    Toggle(isOn: $applyToFollowingMonths) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Reporter sur les mois suivants")
                            Text("Applique ces montants jusqu'à décembre \(year), sauf aux mois déjà renseignés.")
                                .font(.caption)
                                .foregroundStyle(Palette.textSecondary)
                        }
                    }
                    .tint(Palette.accent)
                }
            }
            .scrollContentBackground(.hidden)
            .background(Palette.background)
            .navigationTitle("Salaire & épargne")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Annuler") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Enregistrer") { save() }.fontWeight(.semibold)
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("OK") { focus = nil }
                }
            }
            .onAppear(perform: load)
        }
        .presentationDetents([.medium, .large])
    }

    private func load() {
        guard !didLoad else { return }
        didLoad = true
        if let existing = budgets.first {
            salary = existing.salary
            goal = existing.savingsGoal
        } else if let latest = previousBudget() {
            // Premier passage sur ce mois : on propose les valeurs du dernier
            // mois renseigné plutôt qu'un formulaire vide.
            salary = latest.salary
            goal = latest.savingsGoal
        }
        focus = .salary
    }

    /// Dernier mois renseigné avant celui-ci.
    private func previousBudget() -> MonthBudget? {
        let key = MonthBudget.key(year: year, month: month)
        return allBudgets
            .filter { $0.key < key && $0.salary > 0 }
            .max { $0.key < $1.key }
    }

    private func save() {
        apply(salary: salary, goal: goal, year: year, month: month)

        // `month == 12` : rien à reporter, et `13...12` serait une plage
        // invalide — d'où le `where month < 12`.
        if applyToFollowingMonths, month < 12 {
            let existingKeys = Set(allBudgets.map(\.key))
            for nextMonth in (month + 1)...12 {
                let key = MonthBudget.key(year: year, month: nextMonth)
                guard !existingKeys.contains(key) else { continue }
                apply(salary: salary, goal: goal, year: year, month: nextMonth)
            }
        }

        context.saveChanges()
        Haptics.success()
        dismiss()
    }

    private func apply(salary: Double, goal: Double, year: Int, month: Int) {
        if let existing = allBudgets.first(where: { $0.year == year && $0.month == month }) {
            existing.salary = salary
            existing.savingsGoal = goal
        } else {
            context.insert(MonthBudget(year: year, month: month, salary: salary, savingsGoal: goal))
        }
    }
}

/// Champ de saisie d'un montant : clavier décimal, alignement à droite,
/// chiffres à chasse fixe pour que la valeur ne « danse » pas pendant la frappe.
struct AmountField: View {

    let title: String
    @Binding var value: Double
    var symbol: String?
    var tint: Color = Palette.accent

    var body: some View {
        HStack(spacing: 12) {
            if let symbol {
                Image(systemName: symbol)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(tint)
                    .frame(width: 28, height: 28)
                    .background(Circle().fill(tint.opacity(0.13)))
            }

            Text(title)
                .foregroundStyle(Palette.textPrimary)

            Spacer(minLength: 8)

            TextField(
                "0",
                value: $value,
                format: .currency(code: "EUR").locale(Fmt.locale)
            )
            .keyboardType(.decimalPad)
            .multilineTextAlignment(.trailing)
            .font(.system(.body, design: .rounded).weight(.semibold))
            .monospacedDigit()
            .frame(maxWidth: 150)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }
}
