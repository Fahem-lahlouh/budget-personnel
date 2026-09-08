import Foundation
import SwiftData

/// Jeu de données initial.
///
/// Les listes et les dépenses récurrentes reprennent celles du classeur Excel
/// d'origine ; les dépenses de démonstration sont les mêmes lignes, replacées
/// sur le mois en cours pour que l'app soit immédiatement « habitée » au
/// premier lancement. Tout est réinitialisable depuis les Réglages.
enum SeedData {

    // MARK: - Listes

    /// Catégorie + pictogramme SF Symbols associé.
    static let categories: [(name: String, symbol: String)] = [
        ("Logement", "house.fill"),
        ("Véhicule", "car.fill"),
        ("Télécommunications", "antenna.radiowaves.left.and.right"),
        ("Abonnements", "repeat.circle.fill"),
        ("Équipements", "desktopcomputer"),
        ("Courses", "cart.fill"),
        ("Alimentation", "fork.knife"),
        ("Restaurants", "wineglass.fill"),
        ("Loisirs", "figure.run"),
        ("Vêtements", "tshirt.fill"),
        ("Santé", "cross.case.fill"),
        ("Transport", "tram.fill"),
        ("Cadeaux", "gift.fill"),
        ("Vacances", "airplane"),
        ("Autres", "ellipsis.circle.fill")
    ]

    static let merchants: [String] = [
        "Hmarket", "Carrefour", "Auchan", "Lidl", "E.Leclerc", "Intermarché",
        "Aldi", "Monoprix", "Franprix", "Grand Frais", "Picard", "Autre"
    ]

    // MARK: - Dépenses récurrentes (reprises du classeur)

    struct RecurringSeed {
        let category: String
        let details: String
        let amount: Double
        let day: Int
        let type: ExpenseType
        let confidential: Bool
        let note: String
    }

    static let recurring: [RecurringSeed] = [
        .init(category: "Logement", details: "Loyer + badge", amount: 779, day: 5, type: .fixe, confidential: false, note: ""),
        .init(category: "Autres", details: "Crédit Impot", amount: 527, day: 5, type: .fixe, confidential: true, note: "Mensualité de crédit"),
        .init(category: "Véhicule", details: "Assurance voiture", amount: 93, day: 8, type: .fixe, confidential: false, note: ""),
        .init(category: "Logement", details: "Assurance habitation", amount: 18.80, day: 8, type: .fixe, confidential: false, note: ""),
        .init(category: "Télécommunications", details: "Abonnement téléphone", amount: 9.99, day: 10, type: .fixe, confidential: false, note: ""),
        .init(category: "Télécommunications", details: "Abonnement téléphone épouse", amount: 8.99, day: 10, type: .fixe, confidential: false, note: ""),
        .init(category: "Télécommunications", details: "Fibre Internet appartement", amount: 22.99, day: 10, type: .fixe, confidential: false, note: ""),
        .init(category: "Équipements", details: "iPhone 16 Pro Max", amount: 63, day: 12, type: .fixe, confidential: false, note: "Mensualité"),
        .init(category: "Équipements", details: "TV", amount: 50, day: 12, type: .fixe, confidential: false, note: "Mensualité"),
        .init(category: "Équipements", details: "PlayStation 5", amount: 22.50, day: 12, type: .fixe, confidential: false, note: "Mensualité"),
        .init(category: "Loisirs", details: "Basic-Fit", amount: 25, day: 15, type: .fixe, confidential: false, note: "Abonnement salle"),
        .init(category: "Abonnements", details: "ChatGPT", amount: 23, day: 15, type: .fixe, confidential: false, note: "Abonnement mensuel"),
        .init(category: "Abonnements", details: "Claude", amount: 21.61, day: 15, type: .fixe, confidential: false, note: "Abonnement mensuel"),
        .init(category: "Logement", details: "Électricité", amount: 40, day: 20, type: .fixe, confidential: false, note: "Prélèvement mensuel")
    ]

    // MARK: - Dépenses de démonstration

    struct ExpenseSeed {
        let day: Int
        let category: String
        let merchant: String
        let details: String
        let amount: Double
        let type: ExpenseType
        let status: PaymentStatus
        let confidential: Bool
        let note: String
    }

    /// Un mois type : les récurrentes déjà payées, quelques dépenses variables,
    /// une exceptionnelle, et deux lignes encore « à payer » pour que le rappel
    /// des récurrentes soit visible dès le premier lancement.
    static let demoExpenses: [ExpenseSeed] = [
        .init(day: 5, category: "Logement", merchant: "", details: "Loyer + badge", amount: 779, type: .fixe, status: .paye, confidential: false, note: ""),
        .init(day: 5, category: "Autres", merchant: "", details: "Crédit Impot", amount: 527, type: .fixe, status: .paye, confidential: true, note: "Mensualité de crédit"),
        .init(day: 8, category: "Véhicule", merchant: "", details: "Assurance voiture", amount: 93, type: .fixe, status: .paye, confidential: false, note: ""),
        .init(day: 8, category: "Logement", merchant: "", details: "Assurance habitation", amount: 18.80, type: .fixe, status: .paye, confidential: false, note: ""),
        .init(day: 10, category: "Télécommunications", merchant: "", details: "Abonnement téléphone", amount: 9.99, type: .fixe, status: .paye, confidential: false, note: ""),
        .init(day: 10, category: "Télécommunications", merchant: "", details: "Abonnement téléphone épouse", amount: 8.99, type: .fixe, status: .paye, confidential: false, note: ""),
        .init(day: 10, category: "Télécommunications", merchant: "", details: "Fibre Internet appartement", amount: 22.99, type: .fixe, status: .paye, confidential: false, note: ""),
        .init(day: 12, category: "Équipements", merchant: "", details: "iPhone 16 Pro Max", amount: 63, type: .fixe, status: .paye, confidential: false, note: "Mensualité"),
        .init(day: 12, category: "Équipements", merchant: "", details: "TV", amount: 50, type: .fixe, status: .paye, confidential: false, note: "Mensualité"),
        .init(day: 12, category: "Équipements", merchant: "", details: "PlayStation 5", amount: 22.50, type: .fixe, status: .paye, confidential: false, note: "Mensualité"),
        .init(day: 14, category: "Restaurants", merchant: "Autre", details: "Restaurant", amount: 45, type: .variable, status: .paye, confidential: false, note: "Anniversaire"),
        .init(day: 15, category: "Loisirs", merchant: "", details: "Basic-Fit", amount: 25, type: .fixe, status: .paye, confidential: false, note: "Abonnement salle"),
        .init(day: 15, category: "Abonnements", merchant: "", details: "ChatGPT", amount: 23, type: .fixe, status: .paye, confidential: false, note: "Abonnement mensuel"),
        .init(day: 16, category: "Courses", merchant: "Carrefour", details: "Courses Carrefour", amount: 82, type: .variable, status: .paye, confidential: false, note: "Courses de la semaine"),
        .init(day: 18, category: "Vêtements", merchant: "Autre", details: "Chaussures", amount: 120, type: .variable, status: .paye, confidential: false, note: "Nike"),
        .init(day: 19, category: "Courses", merchant: "Lidl", details: "Courses Lidl", amount: 46.30, type: .variable, status: .paye, confidential: false, note: ""),
        .init(day: 21, category: "Véhicule", merchant: "Autre", details: "Essence", amount: 70, type: .variable, status: .paye, confidential: false, note: "Plein voiture"),
        .init(day: 24, category: "Cadeaux", merchant: "Autre", details: "Cadeau", amount: 50, type: .exceptionnelle, status: .paye, confidential: true, note: "Cadeau surprise"),
        // Encore à régler ce mois-ci — alimente le rappel du tableau de bord.
        .init(day: 15, category: "Abonnements", merchant: "", details: "Claude", amount: 21.61, type: .fixe, status: .aPayer, confidential: false, note: "Abonnement mensuel"),
        .init(day: 20, category: "Logement", merchant: "", details: "Électricité", amount: 40, type: .fixe, status: .aPayer, confidential: false, note: "Prélèvement mensuel")
    ]

    static let demoSalary: Double = 3000
    static let demoSavingsGoal: Double = 300

    // MARK: - Installation

    /// Insère les listes de référence si elles sont absentes.
    /// Appelé à chaque lancement : ne crée que ce qui manque.
    static func installListsIfNeeded(in context: ModelContext) throws {
        let existingCategories = try context.fetch(FetchDescriptor<CategoryItem>())
        if existingCategories.isEmpty {
            for (index, item) in categories.enumerated() {
                context.insert(CategoryItem(name: item.name, symbolName: item.symbol, sortOrder: index))
            }
        }

        let existingMerchants = try context.fetch(FetchDescriptor<MerchantItem>())
        if existingMerchants.isEmpty {
            for (index, name) in merchants.enumerated() {
                context.insert(MerchantItem(name: name, sortOrder: index))
            }
        }
    }

    /// Charge le jeu de démonstration sur le mois en cours.
    static func installDemoData(in context: ModelContext, reference: Date = Date()) {
        let cal = Calendar.budget
        let year = cal.component(.year, from: reference)
        let month = cal.component(.month, from: reference)
        let daysInMonth = cal.range(of: .day, in: .month, for: reference)?.count ?? 28

        for (index, seed) in recurring.enumerated() {
            context.insert(RecurringExpense(
                categoryName: seed.category,
                details: seed.details,
                plannedAmount: seed.amount,
                dayOfMonth: seed.day,
                type: seed.type,
                note: seed.note,
                isConfidential: seed.confidential,
                sortOrder: index
            ))
        }

        let plannedByDetails = Dictionary(
            recurring.map { ($0.details, $0.amount) },
            uniquingKeysWith: { first, _ in first }
        )

        for seed in demoExpenses {
            var comps = DateComponents(year: year, month: month, day: min(seed.day, daysInMonth))
            comps.hour = 12
            let date = cal.date(from: comps) ?? reference
            context.insert(Expense(
                date: date,
                categoryName: seed.category,
                merchantName: seed.merchant,
                details: seed.details,
                amount: seed.amount,
                type: seed.type,
                plannedAmount: plannedByDetails[seed.details],
                status: seed.status,
                note: seed.note,
                isConfidential: seed.confidential
            ))
        }

        context.insert(MonthBudget(year: year, month: month, salary: demoSalary, savingsGoal: demoSavingsGoal))
    }

    /// Efface toutes les données saisies (dépenses, récurrentes, budgets
    /// mensuels) et remet les listes à leur contenu par défaut.
    static func wipeAll(in context: ModelContext) throws {
        try context.delete(model: Expense.self)
        try context.delete(model: RecurringExpense.self)
        try context.delete(model: MonthBudget.self)
        try context.delete(model: CategoryItem.self)
        try context.delete(model: MerchantItem.self)
        try context.save()
        try installListsIfNeeded(in: context)
        try context.save()
    }
}
