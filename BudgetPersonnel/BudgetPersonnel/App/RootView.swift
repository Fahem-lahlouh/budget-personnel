import SwiftUI
import SwiftData
import Observation

/// Racine de l'app : onglets, écran de verrouillage, chargement initial.
struct RootView: View {

    @Environment(\.modelContext) private var context
    @Environment(\.scenePhase) private var scenePhase
    @Environment(LockManager.self) private var lock

    @Query private var settingsRows: [AppSettings]

    @State private var selectedTab: Tab = .month
    @State private var selection = MonthSelection()
    @State private var isAddingExpense = false
    @State private var didBootstrap = false

    enum Tab: Hashable {
        case month, expenses, analytics, settings
    }

    /// Réglages de l'app, créés au premier lancement.
    private var settings: AppSettings? { settingsRows.first }

    var body: some View {
        ZStack {
            if let settings {
                content(settings: settings)
                    .preferredColorScheme(settings.theme.colorScheme)
            } else {
                // Très bref : le temps que `bootstrap()` insère la ligne.
                Color.clear
            }

            if lock.isLocked {
                LockView()
                    .transition(.opacity.combined(with: .scale(scale: 1.03)))
                    .zIndex(10)
            }
        }
        .task { bootstrap() }
        .onChange(of: scenePhase) { _, phase in
            // On re-verrouille dès que l'app quitte le premier plan : le
            // sélecteur d'apps affiche une capture de l'écran courant.
            if phase != .active { lock.lock() }
        }
    }

    @ViewBuilder
    private func content(settings: AppSettings) -> some View {
        TabView(selection: $selectedTab) {
            DashboardView(selection: $selection, settings: settings, onAddExpense: { isAddingExpense = true })
                .tabItem { Label("Mois", systemImage: "square.grid.2x2.fill") }
                .tag(Tab.month)

            ExpenseListView(selection: $selection, settings: settings)
                .tabItem { Label("Dépenses", systemImage: "list.bullet.rectangle.fill") }
                .tag(Tab.expenses)

            AnalyticsView(selection: $selection, settings: settings)
                .tabItem { Label("Analyses", systemImage: "chart.pie.fill") }
                .tag(Tab.analytics)

            SettingsView(settings: settings)
                .tabItem { Label("Réglages", systemImage: "gearshape.fill") }
                .tag(Tab.settings)
        }
        .tint(Palette.accent)
        .sheet(isPresented: $isAddingExpense) {
            ExpenseEditorView(mode: .create(defaultDate: selection.defaultDateForNewExpense), settings: settings)
        }
    }

    // MARK: - Démarrage

    private func bootstrap() {
        guard !didBootstrap else { return }
        didBootstrap = true

        do {
            // Réglages
            let existing = try context.fetch(FetchDescriptor<AppSettings>())
            let settings: AppSettings
            if let first = existing.first {
                settings = first
            } else {
                settings = AppSettings()
                context.insert(settings)
            }

            // Listes de référence
            try SeedData.installListsIfNeeded(in: context)

            // Jeu de démonstration, une seule fois
            if !settings.didSeedDemoData {
                let expenseCount = try context.fetchCount(FetchDescriptor<Expense>())
                if expenseCount == 0 {
                    SeedData.installDemoData(in: context)
                }
                settings.didSeedDemoData = true
            }

            context.saveChanges()
            lock.bootstrap(settings: settings)
        } catch {
            assertionFailure("Démarrage impossible : \(error)")
        }
    }
}

// MARK: - Mois sélectionné

/// Mois affiché par les écrans Mois / Dépenses / Analyses.
///
/// Partagé entre les onglets : changer de mois sur le tableau de bord garde la
/// liste et les analyses sur le même mois, ce qui évite de se perdre.
@Observable
final class MonthSelection {

    var year: Int
    var month: Int

    init(date: Date = Date()) {
        let cal = Calendar.budget
        year = cal.component(.year, from: date)
        month = cal.component(.month, from: date)
    }

    var label: String { "\(Fmt.monthName(month)) \(year)" }

    var isCurrentMonth: Bool {
        let cal = Calendar.budget
        let now = Date()
        return year == cal.component(.year, from: now) && month == cal.component(.month, from: now)
    }

    /// Date proposée à la création d'une dépense : aujourd'hui si l'on est sur
    /// le mois courant, sinon le 1er du mois affiché.
    var defaultDateForNewExpense: Date {
        if isCurrentMonth { return Date() }
        var comps = DateComponents(year: year, month: month, day: 1)
        comps.hour = 12
        return Calendar.budget.date(from: comps) ?? Date()
    }

    func advance(by delta: Int) {
        var comps = DateComponents(year: year, month: month, day: 1)
        comps.hour = 12
        guard let current = Calendar.budget.date(from: comps),
              let moved = Calendar.budget.date(byAdding: .month, value: delta, to: current) else { return }
        year = Calendar.budget.component(.year, from: moved)
        month = Calendar.budget.component(.month, from: moved)
    }

    func goToToday() {
        let cal = Calendar.budget
        year = cal.component(.year, from: Date())
        month = cal.component(.month, from: Date())
    }
}
