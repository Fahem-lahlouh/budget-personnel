import Foundation

// MARK: - Agrégats

/// Total pour un libellé (catégorie ou enseigne), avec sa part du total.
struct NamedTotal: Identifiable, Equatable {
    let name: String
    let amount: Double
    let share: Double
    var id: String { name }
}

/// Synthèse d'un mois. Reprend tous les indicateurs de l'onglet mensuel du
/// classeur (KPI, répartitions, prévisions) en une seule passe sur les dépenses.
struct MonthSummary: Equatable {

    let year: Int
    let month: Int

    let salary: Double
    let savingsGoal: Double

    /// Total dépensé sur le mois.
    let total: Double
    let count: Int

    let byCategory: [NamedTotal]
    let byMerchant: [NamedTotal]
    let byType: [ExpenseType: Double]
    let byStatus: [PaymentStatus: Double]
    let unpaidCount: Int

    /// Somme des montants prévus encore attendus (récurrentes non saisies).
    let expectedRemaining: Double

    var label: String { "\(Fmt.monthName(month)) \(year)" }

    /// Reste disponible = salaire − dépenses (peut être négatif : dépassement).
    var remaining: Double { salary - total }

    /// Épargne réelle. Comme dans le classeur, on ne compte pas une épargne
    /// négative : un dépassement, ce n'est pas « épargner moins », c'est zéro.
    var realSavings: Double { max(0, remaining) }

    /// Part du salaire déjà consommée. `0` si le salaire n'est pas renseigné.
    var consumption: Double { salary > 0 ? total / salary : 0 }

    /// Dépenses projetées en fin de mois (réel + récurrentes non encore saisies).
    var forecastTotal: Double { total + expectedRemaining }

    var forecastRemaining: Double { salary - forecastTotal }

    /// Progression vers l'objectif d'épargne, bornée à 1.
    var savingsProgress: Double {
        guard savingsGoal > 0 else { return 0 }
        return min(1, realSavings / savingsGoal)
    }

    var isOverBudget: Bool { salary > 0 && total > salary }

    static func empty(year: Int, month: Int) -> MonthSummary {
        MonthSummary(
            year: year, month: month, salary: 0, savingsGoal: 0,
            total: 0, count: 0, byCategory: [], byMerchant: [],
            byType: [:], byStatus: [:], unpaidCount: 0, expectedRemaining: 0
        )
    }
}

/// Synthèse annuelle : les 12 mois, plus les cumuls.
struct YearSummary: Equatable {

    let year: Int
    let months: [MonthSummary]

    var salary: Double { months.reduce(0) { $0 + $1.salary } }
    var total: Double { months.reduce(0) { $0 + $1.total } }
    var count: Int { months.reduce(0) { $0 + $1.count } }
    var remaining: Double { salary - total }
    var realSavings: Double { max(0, remaining) }
    var consumption: Double { salary > 0 ? total / salary : 0 }

    /// Moyenne calculée sur les seuls mois réellement renseignés — un mois à
    /// zéro tirerait la moyenne vers le bas sans rien vouloir dire.
    var monthlyAverage: Double {
        let active = months.filter { $0.total > 0 }
        guard !active.isEmpty else { return 0 }
        return active.reduce(0) { $0 + $1.total } / Double(active.count)
    }

    var busiestMonth: MonthSummary? {
        months.max { $0.total < $1.total }.flatMap { $0.total > 0 ? $0 : nil }
    }

    var byCategory: [NamedTotal] {
        BudgetEngine.aggregate(months.flatMap { $0.byCategory })
    }

    var byMerchant: [NamedTotal] {
        BudgetEngine.aggregate(months.flatMap { $0.byMerchant })
    }

    var byType: [ExpenseType: Double] {
        months.reduce(into: [:]) { result, month in
            for (type, amount) in month.byType { result[type, default: 0] += amount }
        }
    }

    var byStatus: [PaymentStatus: Double] {
        months.reduce(into: [:]) { result, month in
            for (status, amount) in month.byStatus { result[status, default: 0] += amount }
        }
    }
}

/// Une récurrente attendue ce mois-ci et son état.
struct RecurringStatus: Identifiable, Equatable {
    let recurring: RecurringExpense
    /// Dépense correspondante déjà saisie ce mois-ci, s'il y en a une.
    let matched: Expense?
    let dueDate: Date

    var id: UUID { recurring.uid }

    /// Rien n'a encore été saisi pour cette récurrente ce mois-ci.
    var isMissing: Bool { matched == nil }

    /// Saisie, mais toujours marquée « à payer ».
    var isPending: Bool { matched?.status == .aPayer }

    /// À traiter : soit absente, soit non réglée.
    var needsAttention: Bool { isMissing || isPending }

    static func == (lhs: RecurringStatus, rhs: RecurringStatus) -> Bool {
        lhs.recurring.uid == rhs.recurring.uid
            && lhs.matched?.uid == rhs.matched?.uid
            && lhs.dueDate == rhs.dueDate
    }
}

// MARK: - Moteur

/// Toutes les agrégations de l'app. Fonctions pures : mêmes entrées, mêmes
/// sorties, testables sans base de données et sans interface.
enum BudgetEngine {

    /// Construit la synthèse d'un mois.
    static func summarize(
        expenses: [Expense],
        recurring: [RecurringExpense],
        budget: MonthBudget?,
        year: Int,
        month: Int
    ) -> MonthSummary {

        let monthly = expenses.filter { $0.year == year && $0.month == month }

        var total: Double = 0
        var categoryTotals: [String: Double] = [:]
        var merchantTotals: [String: Double] = [:]
        var typeTotals: [ExpenseType: Double] = [:]
        var statusTotals: [PaymentStatus: Double] = [:]
        var unpaid = 0

        for expense in monthly {
            total += expense.amount

            let category = expense.categoryName.isEmpty ? "Sans catégorie" : expense.categoryName
            categoryTotals[category, default: 0] += expense.amount

            // Une dépense sans enseigne n'est pas rangée sous « Autre » : elle
            // fausserait le classement des enseignes où l'on dépense le plus.
            if !expense.merchantName.isEmpty {
                merchantTotals[expense.merchantName, default: 0] += expense.amount
            }

            typeTotals[expense.type, default: 0] += expense.amount
            statusTotals[expense.status, default: 0] += expense.amount
            if expense.status == .aPayer { unpaid += 1 }
        }

        let statuses = recurringStatuses(expenses: monthly, recurring: recurring, year: year, month: month)
        let expectedRemaining = statuses
            .filter { $0.isMissing }
            .reduce(0) { $0 + $1.recurring.plannedAmount }

        return MonthSummary(
            year: year,
            month: month,
            salary: budget?.salary ?? 0,
            savingsGoal: budget?.savingsGoal ?? 0,
            total: total,
            count: monthly.count,
            byCategory: ranked(categoryTotals, total: total),
            byMerchant: ranked(merchantTotals, total: total),
            byType: typeTotals,
            byStatus: statusTotals,
            unpaidCount: unpaid,
            expectedRemaining: expectedRemaining
        )
    }

    /// Construit les 12 synthèses mensuelles d'une année.
    static func summarizeYear(
        expenses: [Expense],
        recurring: [RecurringExpense],
        budgets: [MonthBudget],
        year: Int
    ) -> YearSummary {
        let budgetsByMonth = Dictionary(
            budgets.filter { $0.year == year }.map { ($0.month, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        let months = (1...12).map { month in
            summarize(
                expenses: expenses,
                recurring: recurring,
                budget: budgetsByMonth[month],
                year: year,
                month: month
            )
        }
        return YearSummary(year: year, months: months)
    }

    /// État des récurrentes pour un mois donné.
    static func recurringStatuses(
        expenses: [Expense],
        recurring: [RecurringExpense],
        year: Int,
        month: Int
    ) -> [RecurringStatus] {

        let monthly = expenses.filter { $0.year == year && $0.month == month }

        return recurring
            .filter(\.isActive)
            .sorted { ($0.dayOfMonth, $0.sortOrder) < ($1.dayOfMonth, $1.sortOrder) }
            .map { item in
                // Rattachement explicite en priorité, puis repli sur le libellé
                // — c'est ce que faisait le RECHERCHEV du classeur.
                let match = monthly.first { $0.recurringID == item.uid }
                    ?? monthly.first {
                        $0.details.compare(item.details, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
                    }
                return RecurringStatus(
                    recurring: item,
                    matched: match,
                    dueDate: item.dueDate(year: year, month: month)
                )
            }
    }

    /// Montant prévu applicable à une dépense, d'après les récurrentes.
    static func plannedAmount(forDetails details: String, in recurring: [RecurringExpense]) -> Double? {
        let trimmed = details.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return recurring.first {
            $0.isActive && $0.details.compare(trimmed, options: [.caseInsensitive, .diacriticInsensitive]) == .orderedSame
        }?.plannedAmount
    }

    // MARK: Regroupements

    /// Trie un dictionnaire de totaux et calcule les parts.
    static func ranked(_ totals: [String: Double], total: Double) -> [NamedTotal] {
        totals
            .filter { $0.value > 0 }
            .sorted { lhs, rhs in
                // Tri sur le montant, puis sur le nom : deux montants égaux ne
                // doivent pas changer d'ordre d'un affichage à l'autre.
                lhs.value == rhs.value ? lhs.key < rhs.key : lhs.value > rhs.value
            }
            .map { NamedTotal(name: $0.key, amount: $0.value, share: total > 0 ? $0.value / total : 0) }
    }

    /// Fusionne plusieurs listes de totaux (utilisé pour la vue annuelle).
    static func aggregate(_ totals: [NamedTotal]) -> [NamedTotal] {
        var merged: [String: Double] = [:]
        for item in totals { merged[item.name, default: 0] += item.amount }
        let sum = merged.values.reduce(0, +)
        return ranked(merged, total: sum)
    }

    /// Top N + regroupement du reste sous « Autres », pour le donut.
    static func topWithOthers(_ totals: [NamedTotal], limit: Int = 5) -> [NamedTotal] {
        guard totals.count > limit else { return totals }
        let head = Array(totals.prefix(limit))
        let tail = totals.dropFirst(limit)
        let othersAmount = tail.reduce(0) { $0 + $1.amount }
        guard othersAmount > 0 else { return head }
        let othersShare = tail.reduce(0) { $0 + $1.share }
        return head + [NamedTotal(name: "Autres", amount: othersAmount, share: othersShare)]
    }
}
