import Foundation
import SwiftData

/// Une dépense — la ligne du tableau mensuel du classeur Excel d'origine.
///
/// Les catégories et enseignes sont stockées par **nom** plutôt que par
/// relation : c'est ce que faisait le classeur, ça garde les dépenses lisibles
/// même si une catégorie est supprimée des listes, et ça évite les cascades de
/// suppression involontaires. Le renommage depuis les Réglages met à jour les
/// dépenses concernées (voir `ListsStore.rename`).
@Model
final class Expense {

    /// Identifiant stable propre à l'app (l'`id` de SwiftData, lui, change de
    /// forme entre les magasins). Sert à relier une dépense à sa récurrente.
    var uid: UUID = UUID()

    var date: Date = Date()
    var categoryName: String = ""
    var merchantName: String = ""

    /// Libellé libre de la dépense (« Loyer + badge », « Courses Carrefour »…).
    var details: String = ""

    var amount: Double = 0

    /// Stockage brut de `ExpenseType` : SwiftData ne persiste pas les enums
    /// non-`Codable` de façon requêtable, une `String` reste filtrable.
    var typeRaw: String = ExpenseType.variable.rawValue

    /// Montant budgété, repris de la dépense récurrente correspondante.
    /// `nil` quand la dépense n'a pas de budget associé.
    var plannedAmount: Double?

    var statusRaw: String = PaymentStatus.paye.rawValue

    var note: String = ""

    /// Dépense masquée même une fois l'app déverrouillée (cadeau surprise…).
    var isConfidential: Bool = false

    /// Récurrente d'origine, quand la dépense a été créée depuis un modèle.
    var recurringID: UUID?

    var createdAt: Date = Date()

    init(
        uid: UUID = UUID(),
        date: Date = Date(),
        categoryName: String = "",
        merchantName: String = "",
        details: String = "",
        amount: Double = 0,
        type: ExpenseType = .variable,
        plannedAmount: Double? = nil,
        status: PaymentStatus = .paye,
        note: String = "",
        isConfidential: Bool = false,
        recurringID: UUID? = nil,
        createdAt: Date = Date()
    ) {
        self.uid = uid
        self.date = date
        self.categoryName = categoryName
        self.merchantName = merchantName
        self.details = details
        self.amount = amount
        self.typeRaw = type.rawValue
        self.plannedAmount = plannedAmount
        self.statusRaw = status.rawValue
        self.note = note
        self.isConfidential = isConfidential
        self.recurringID = recurringID
        self.createdAt = createdAt
    }

    // MARK: - Accès typés

    var type: ExpenseType {
        get { ExpenseType(rawValue: typeRaw) ?? .variable }
        set { typeRaw = newValue.rawValue }
    }

    var status: PaymentStatus {
        get { PaymentStatus(rawValue: statusRaw) ?? .paye }
        set { statusRaw = newValue.rawValue }
    }

    // MARK: - Valeurs dérivées

    /// Écart = montant réel − montant prévu.
    ///
    /// Positif ⇒ dépassement du budget, négatif ⇒ économie. `nil` quand aucun
    /// montant prévu n'est renseigné (il n'y a alors rien à comparer).
    ///
    /// - Note: le classeur Excel calculait l'inverse (prévu − réel). La
    ///   convention retenue ici est celle demandée : « réel − prévu », de sorte
    ///   qu'un nombre rouge et positif signale toujours un dépassement.
    var variance: Double? {
        guard let plannedAmount, plannedAmount != 0 else { return nil }
        return amount - plannedAmount
    }

    var year: Int { Calendar.budget.component(.year, from: date) }
    var month: Int { Calendar.budget.component(.month, from: date) }
}

extension Calendar {
    /// Calendrier partagé, en français, semaine commençant le lundi.
    static let budget: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.locale = Fmt.locale
        c.firstWeekday = 2
        return c
    }()
}
