import Foundation
import SwiftData

/// Une dépense qui revient chaque mois (loyer, crédit, abonnements…).
///
/// Elle joue trois rôles, exactement comme la table « Recurrents » du classeur :
/// elle fournit le **montant prévu** pour calculer l'écart, elle alimente le
/// **rappel des récurrentes non payées** du mois en cours, et elle **pré-remplit**
/// la saisie rapide.
@Model
final class RecurringExpense {

    var uid: UUID = UUID()
    var categoryName: String = ""
    var merchantName: String = ""
    var details: String = ""

    /// Montant budgété pour le mois.
    var plannedAmount: Double = 0

    /// Jour du mois où la dépense tombe habituellement (1–31, borné au dernier
    /// jour réel du mois lors de la création de la dépense).
    var dayOfMonth: Int = 1

    var typeRaw: String = ExpenseType.fixe.rawValue
    var note: String = ""
    var isConfidential: Bool = false

    /// Une récurrente désactivée reste dans l'historique mais ne génère plus
    /// ni rappel ni montant prévu.
    var isActive: Bool = true

    var sortOrder: Int = 0

    init(
        uid: UUID = UUID(),
        categoryName: String = "",
        merchantName: String = "",
        details: String = "",
        plannedAmount: Double = 0,
        dayOfMonth: Int = 1,
        type: ExpenseType = .fixe,
        note: String = "",
        isConfidential: Bool = false,
        isActive: Bool = true,
        sortOrder: Int = 0
    ) {
        self.uid = uid
        self.categoryName = categoryName
        self.merchantName = merchantName
        self.details = details
        self.plannedAmount = plannedAmount
        self.dayOfMonth = dayOfMonth
        self.typeRaw = type.rawValue
        self.note = note
        self.isConfidential = isConfidential
        self.isActive = isActive
        self.sortOrder = sortOrder
    }

    var type: ExpenseType {
        get { ExpenseType(rawValue: typeRaw) ?? .fixe }
        set { typeRaw = newValue.rawValue }
    }

    /// Date d'échéance dans un mois donné, ramenée au dernier jour du mois quand
    /// le jour habituel n'existe pas (le 31 en février, par exemple).
    func dueDate(year: Int, month: Int) -> Date {
        let cal = Calendar.budget
        var comps = DateComponents(year: year, month: month, day: 1)
        guard let first = cal.date(from: comps),
              let range = cal.range(of: .day, in: .month, for: first) else {
            return Date()
        }
        comps.day = min(max(dayOfMonth, 1), range.count)
        return cal.date(from: comps) ?? first
    }
}
