import Foundation
import SwiftData

/// Salaire et objectif d'épargne d'un mois donné.
///
/// Un enregistrement par mois réellement renseigné : les mois vides n'occupent
/// pas de place et sont traités comme « salaire 0 ».
@Model
final class MonthBudget {

    /// Clé « 2026-01 », pratique pour trier et pour un tri stable dans l'export.
    @Attribute(.unique) var key: String = ""

    var year: Int = 0
    var month: Int = 0
    var salary: Double = 0
    var savingsGoal: Double = 0

    init(year: Int, month: Int, salary: Double = 0, savingsGoal: Double = 0) {
        self.key = MonthBudget.key(year: year, month: month)
        self.year = year
        self.month = month
        self.salary = salary
        self.savingsGoal = savingsGoal
    }

    static func key(year: Int, month: Int) -> String {
        String(format: "%04d-%02d", year, month)
    }
}

/// Une catégorie de dépense, éditable depuis les Réglages.
@Model
final class CategoryItem {

    @Attribute(.unique) var name: String = ""
    var symbolName: String = "tag.fill"
    var sortOrder: Int = 0

    init(name: String, symbolName: String = "tag.fill", sortOrder: Int = 0) {
        self.name = name
        self.symbolName = symbolName
        self.sortOrder = sortOrder
    }
}

/// Une enseigne / un fournisseur, éditable depuis les Réglages.
@Model
final class MerchantItem {

    @Attribute(.unique) var name: String = ""
    var sortOrder: Int = 0

    init(name: String, sortOrder: Int = 0) {
        self.name = name
        self.sortOrder = sortOrder
    }
}

/// Réglages de l'application. Une seule instance est conservée en base.
///
/// Le code PIN n'est **pas** ici : il vit dans le Trousseau (voir `PinStore`),
/// qui est chiffré par le système. Seul l'état « un PIN existe » est reflété
/// par `isLockEnabled`.
@Model
final class AppSettings {

    @Attribute(.unique) var singletonKey: String = "settings"

    var themeRaw: String = AppTheme.system.rawValue

    /// Verrouillage de l'app par code PIN.
    var isLockEnabled: Bool = false

    /// Face ID / Touch ID comme alternative rapide au PIN.
    var isBiometricsEnabled: Bool = false

    /// Deuxième niveau : les dépenses marquées « Confidentiel » restent
    /// masquées après le déverrouillage global, jusqu'à une authentification
    /// dédiée valable le temps de la session.
    var requiresSecondUnlockForConfidential: Bool = true

    // Libellés affichés des types et statuts (renommables dans les Réglages).
    var labelFixe: String = ExpenseType.fixe.defaultLabel
    var labelVariable: String = ExpenseType.variable.defaultLabel
    var labelExceptionnelle: String = ExpenseType.exceptionnelle.defaultLabel
    var labelPaye: String = PaymentStatus.paye.defaultLabel
    var labelAPayer: String = PaymentStatus.aPayer.defaultLabel

    /// Passe à `true` après le premier lancement (jeu de démonstration chargé).
    var didSeedDemoData: Bool = false

    init() {}

    var theme: AppTheme {
        get { AppTheme(rawValue: themeRaw) ?? .system }
        set { themeRaw = newValue.rawValue }
    }

    func label(for type: ExpenseType) -> String {
        switch type {
        case .fixe: return labelFixe.isEmpty ? type.defaultLabel : labelFixe
        case .variable: return labelVariable.isEmpty ? type.defaultLabel : labelVariable
        case .exceptionnelle: return labelExceptionnelle.isEmpty ? type.defaultLabel : labelExceptionnelle
        }
    }

    func setLabel(_ value: String, for type: ExpenseType) {
        switch type {
        case .fixe: labelFixe = value
        case .variable: labelVariable = value
        case .exceptionnelle: labelExceptionnelle = value
        }
    }

    func label(for status: PaymentStatus) -> String {
        switch status {
        case .paye: return labelPaye.isEmpty ? status.defaultLabel : labelPaye
        case .aPayer: return labelAPayer.isEmpty ? status.defaultLabel : labelAPayer
        }
    }

    func setLabel(_ value: String, for status: PaymentStatus) {
        switch status {
        case .paye: labelPaye = value
        case .aPayer: labelAPayer = value
        }
    }
}
