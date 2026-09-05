import SwiftUI
import SwiftData

@main
struct BudgetPersonnelApp: App {

    /// Conteneur SwiftData, unique pour toute l'app.
    ///
    /// La base vit dans le conteneur de l'app, sur l'appareil. Rien n'est
    /// envoyé sur un serveur : aucun réseau n'est nécessaire pour utiliser
    /// l'app. SwiftData écrit sur disque à chaque `save()`, et l'app
    /// sauvegarde après chaque modification (voir `ModelContext.saveChanges`).
    ///
    /// - Note: pour activer la synchronisation iCloud plus tard, voir la
    ///   section « iCloud » du README : il faut ajouter la capacité CloudKit et
    ///   retirer les contraintes `@Attribute(.unique)`, que CloudKit ne sait
    ///   pas reproduire.
    let container: ModelContainer

    @State private var lock = LockManager()

    init() {
        let schema = Schema([
            Expense.self,
            RecurringExpense.self,
            MonthBudget.self,
            CategoryItem.self,
            MerchantItem.self,
            AppSettings.self
        ])
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: false)

        do {
            container = try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            // Un échec ici signifie que le magasin sur disque est illisible
            // (migration impossible, disque plein). Plutôt que de planter sans
            // rien dire, on repart sur un magasin en mémoire : l'app reste
            // utilisable et l'écran d'accueil signale le problème.
            let fallback = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            container = try! ModelContainer(for: schema, configurations: [fallback])
        }
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(lock)
        }
        .modelContainer(container)
    }
}

// MARK: - Sauvegarde

extension ModelContext {
    /// Sauvegarde immédiate après chaque modification.
    ///
    /// SwiftData sauvegarde tout seul, mais de façon différée : en cas de
    /// fermeture brutale, la dernière saisie pourrait être perdue. On force
    /// donc l'écriture dès qu'une donnée change — le coût est négligeable à
    /// l'échelle de quelques milliers de lignes.
    func saveChanges() {
        guard hasChanges else { return }
        do {
            try save()
        } catch {
            assertionFailure("Échec de sauvegarde SwiftData : \(error)")
        }
    }
}
