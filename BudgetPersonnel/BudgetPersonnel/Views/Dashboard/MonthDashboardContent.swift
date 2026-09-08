import SwiftUI
import SwiftData

/// Contenu du tableau de bord pour un mois donné.
///
/// La requête SwiftData est construite dans l'`init` : elle ne rapatrie que les
/// dépenses du mois affiché, pas toute la base.
struct MonthDashboardContent: View {

    let year: Int
    let month: Int
    let settings: AppSettings
    let onAddExpense: () -> Void
    let onEditBudget: () -> Void

    @Query private var expenses: [Expense]
    @Query(sort: \RecurringExpense.sortOrder) private var recurring: [RecurringExpense]
    @Query private var budgets: [MonthBudget]

    @Environment(LockManager.self) private var lock
    @Environment(\.modelContext) private var context

    @State private var prefilled: RecurringExpense?

    init(
        year: Int,
        month: Int,
        settings: AppSettings,
        onAddExpense: @escaping () -> Void,
        onEditBudget: @escaping () -> Void
    ) {
        self.year = year
        self.month = month
        self.settings = settings
        self.onAddExpense = onAddExpense
        self.onEditBudget = onEditBudget

        let range = MonthRange(year: year, month: month)
        let start = range.start
        let end = range.end
        _expenses = Query(
            filter: #Predicate<Expense> { $0.date >= start && $0.date < end },
            sort: [SortDescriptor(\Expense.date, order: .reverse)]
        )

        let key = MonthBudget.key(year: year, month: month)
        _budgets = Query(filter: #Predicate<MonthBudget> { $0.key == key })
    }

    private var budget: MonthBudget? { budgets.first }

    private var summary: MonthSummary {
        BudgetEngine.summarize(
            expenses: expenses,
            recurring: recurring,
            budget: budget,
            year: year,
            month: month
        )
    }

    private var pendingRecurring: [RecurringStatus] {
        BudgetEngine
            .recurringStatuses(expenses: expenses, recurring: recurring, year: year, month: month)
            .filter(\.needsAttention)
    }

    var body: some View {
        let summary = self.summary

        Group {
            heroCard(summary)
            kpiGrid(summary)

            if !pendingRecurring.isEmpty {
                RecurringReminderCard(
                    statuses: pendingRecurring,
                    settings: settings,
                    onQuickAdd: { prefilled = $0 },
                    onMarkPaid: markPaid
                )
            }

            if summary.count > 0 {
                topCategoriesCard(summary)
                forecastCard(summary)
            }

            AdviceCard(summary: summary)

            if summary.count == 0 {
                Card {
                    EmptyStateView(
                        symbol: "tray",
                        title: "Aucune dépense en \(Fmt.monthName(month).lowercased())",
                        message: "Ajoutez votre première dépense du mois : les indicateurs et les graphiques se remplissent aussitôt.",
                        actionTitle: "Ajouter une dépense",
                        action: onAddExpense
                    )
                }
            }
        }
        .sheet(item: $prefilled) { item in
            ExpenseEditorView(
                mode: .createFromRecurring(item, year: year, month: month),
                settings: settings
            )
        }
    }

    // MARK: - Carte principale

    private func heroCard(_ summary: MonthSummary) -> some View {
        Card {
            VStack(spacing: 18) {
                BudgetRing(
                    ratio: summary.consumption,
                    spent: summary.total,
                    caption: summary.salary > 0
                        ? "dépensés sur \(lock.isLocked ? Fmt.masked : Fmt.money(summary.salary))"
                        : "dépensés ce mois-ci"
                )
                .padding(.top, 4)

                Divider().overlay(Palette.hairline)

                HStack(spacing: 12) {
                    heroStat(
                        title: "Salaire",
                        value: summary.salary,
                        tint: Palette.accent
                    )
                    Divider().frame(height: 34).overlay(Palette.hairline)
                    heroStat(
                        title: "Reste disponible",
                        value: summary.remaining,
                        tint: summary.remaining < 0 ? Palette.negative : Palette.positive
                    )
                }

                Button {
                    Haptics.tap()
                    onEditBudget()
                } label: {
                    Label(
                        summary.salary > 0 ? "Modifier salaire et objectif" : "Renseigner mon salaire",
                        systemImage: "slider.horizontal.3"
                    )
                    .font(.footnote.weight(.semibold))
                }
                .buttonStyle(SoftButtonStyle())
            }
            .frame(maxWidth: .infinity)
        }
    }

    private func heroStat(title: String, value: Double, tint: Color) -> some View {
        VStack(spacing: 3) {
            Text(title)
                .font(.caption)
                .foregroundStyle(Palette.textSecondary)
            AmountText(value: value, style: .row, tint: tint)
        }
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .combine)
    }

    // MARK: - Grille d'indicateurs

    private func kpiGrid(_ summary: MonthSummary) -> some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: Metrics.stackSpacing),
                      GridItem(.flexible(), spacing: Metrics.stackSpacing)],
            spacing: Metrics.stackSpacing
        ) {
            KPITile(
                symbol: "arrow.down.circle.fill",
                title: "Total dépensé",
                value: summary.total,
                subtitle: summary.salary > 0 ? "\(Fmt.ratio(summary.consumption)) du salaire" : nil,
                tint: Palette.negative
            )

            KPITile(
                symbol: "banknote.fill",
                title: "Épargne réelle",
                value: summary.realSavings,
                subtitle: summary.salary > 0 ? "\(Fmt.ratio(summary.realSavings / summary.salary)) du salaire" : nil,
                tint: Palette.positive
            )

            SavingsGoalTile(summary: summary)

            InfoTile(
                symbol: "list.number",
                title: "Dépenses",
                value: "\(summary.count)",
                subtitle: summary.unpaidCount > 0
                    ? "dont \(summary.unpaidCount) à payer"
                    : "toutes réglées",
                tint: summary.unpaidCount > 0 ? Palette.warning : Palette.positive
            )
        }
    }

    // MARK: - Top catégories

    private func topCategoriesCard(_ summary: MonthSummary) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                SectionHeader("Où part l'argent", subtitle: "Top catégories du mois")

                ForEach(Array(summary.byCategory.prefix(5).enumerated()), id: \.element.id) { index, item in
                    RankRow(
                        rank: index + 1,
                        name: item.name,
                        amount: item.amount,
                        share: item.share,
                        color: Palette.color(forName: item.name),
                        symbol: symbol(forCategory: item.name)
                    )
                }
            }
        }
    }

    private func symbol(forCategory name: String) -> String? {
        SeedData.categories.first { $0.name == name }?.symbol
    }

    // MARK: - Prévisions

    private func forecastCard(_ summary: MonthSummary) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionHeader(
                    "Prévisions fin de mois",
                    subtitle: summary.expectedRemaining > 0
                        ? "Récurrentes pas encore saisies incluses"
                        : "Toutes les récurrentes sont saisies"
                )

                forecastRow("Déjà dépensé", summary.total, tint: Palette.textPrimary)
                forecastRow("Reste à venir (récurrentes)", summary.expectedRemaining, tint: Palette.warning)

                Divider().overlay(Palette.hairline)

                forecastRow("Total projeté", summary.forecastTotal, tint: Palette.textPrimary, emphasized: true)
                forecastRow(
                    "Reste estimé",
                    summary.forecastRemaining,
                    tint: summary.forecastRemaining < 0 ? Palette.negative : Palette.positive,
                    emphasized: true
                )
            }
        }
    }

    private func forecastRow(_ title: String, _ value: Double, tint: Color, emphasized: Bool = false) -> some View {
        HStack {
            Text(title)
                .font(emphasized ? .subheadline.weight(.semibold) : .subheadline)
                .foregroundStyle(emphasized ? Palette.textPrimary : Palette.textSecondary)
            Spacer(minLength: 8)
            AmountText(value: value, style: .row, tint: tint)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: - Actions

    private func markPaid(_ status: RecurringStatus) {
        Haptics.success()
        if let expense = status.matched {
            expense.status = .paye
        } else {
            let item = status.recurring
            context.insert(Expense(
                date: status.dueDate,
                categoryName: item.categoryName,
                merchantName: item.merchantName,
                details: item.details,
                amount: item.plannedAmount,
                type: item.type,
                plannedAmount: item.plannedAmount,
                status: .paye,
                note: item.note,
                isConfidential: item.isConfidential,
                recurringID: item.uid
            ))
        }
        context.saveChanges()
    }
}

// MARK: - Tuile objectif d'épargne

/// Tuile de l'objectif d'épargne, avec sa jauge de progression.
private struct SavingsGoalTile: View {

    let summary: MonthSummary

    var body: some View {
        Card(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: "target")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Palette.accent)
                        .frame(width: 26, height: 26)
                        .background(Circle().fill(Palette.accentSoft))

                    Text("Objectif d'épargne")
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(Palette.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }

                AmountText(value: summary.savingsGoal, style: .tile)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)

                if summary.savingsGoal > 0 {
                    ProgressBar(
                        value: summary.savingsProgress,
                        tint: summary.savingsProgress >= 1 ? Palette.positive : Palette.accent,
                        height: 6
                    )
                    Text(summary.savingsProgress >= 1
                         ? "Objectif atteint"
                         : "\(Fmt.ratio(summary.savingsProgress)) atteint")
                        .font(.caption)
                        .foregroundStyle(summary.savingsProgress >= 1 ? Palette.positive : Palette.textTertiary)
                } else {
                    Text("Non défini")
                        .font(.caption)
                        .foregroundStyle(Palette.textTertiary)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
