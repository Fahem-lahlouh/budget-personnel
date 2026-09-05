import SwiftUI
import SwiftData

/// Graphiques du mois affiché.
struct MonthAnalyticsContent: View {

    let year: Int
    let month: Int
    let settings: AppSettings

    @Query private var expenses: [Expense]
    @Query private var yearExpenses: [Expense]
    @Query(sort: \RecurringExpense.sortOrder) private var recurring: [RecurringExpense]
    @Query private var budgets: [MonthBudget]

    init(year: Int, month: Int, settings: AppSettings) {
        self.year = year
        self.month = month
        self.settings = settings

        let monthRange = MonthRange(year: year, month: month)
        let monthStart = monthRange.start
        let monthEnd = monthRange.end
        _expenses = Query(filter: #Predicate<Expense> { $0.date >= monthStart && $0.date < monthEnd })

        let yearRange = MonthRange(year: year)
        let yearStart = yearRange.start
        let yearEnd = yearRange.end
        _yearExpenses = Query(filter: #Predicate<Expense> { $0.date >= yearStart && $0.date < yearEnd })

        _budgets = Query(filter: #Predicate<MonthBudget> { $0.year == year })
    }

    private var summary: MonthSummary {
        BudgetEngine.summarize(
            expenses: expenses,
            recurring: recurring,
            budget: budgets.first { $0.month == month },
            year: year,
            month: month
        )
    }

    private var yearSummary: YearSummary {
        BudgetEngine.summarizeYear(expenses: yearExpenses, recurring: recurring, budgets: budgets, year: year)
    }

    private var trendPoints: [SalaryVsSpendingPoint] {
        yearSummary.months.map {
            SalaryVsSpendingPoint(month: $0.month, salary: $0.salary, spent: $0.total)
        }
    }

    var body: some View {
        let summary = self.summary

        if summary.count == 0 {
            Card {
                EmptyStateView(
                    symbol: "chart.pie",
                    title: "Rien à analyser",
                    message: "Les graphiques apparaissent dès la première dépense saisie sur \(Fmt.monthName(month).lowercased()) \(year)."
                )
            }
        } else {
            AnalyticsCard(title: "Répartition par catégorie", subtitle: "Top 5 et regroupement « Autres »") {
                CategoryDonutChart(totals: summary.byCategory, total: summary.total)
            }

            AnalyticsCard(title: "Enseignes", subtitle: "Là où vous dépensez le plus") {
                if summary.byMerchant.isEmpty {
                    Text("Aucune enseigne renseignée sur ce mois. Ajoutez-en une dans le détail d'une dépense pour alimenter ce classement.")
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                } else {
                    VStack(spacing: 12) {
                        ForEach(Array(summary.byMerchant.prefix(6).enumerated()), id: \.element.id) { index, item in
                            RankRow(
                                rank: index + 1,
                                name: item.name,
                                amount: item.amount,
                                share: item.share,
                                color: Palette.color(forName: item.name)
                            )
                        }
                    }
                }
            }

            AnalyticsCard(title: "Nature des dépenses", subtitle: "Fixe · Variable · Exceptionnelle") {
                StackedShareChart(segments: ExpenseType.allCases.map { type in
                    StackedShareChart.Segment(
                        label: settings.label(for: type),
                        value: summary.byType[type] ?? 0,
                        color: type.tint
                    )
                })
            }

            AnalyticsCard(title: "État de règlement", subtitle: "Payé · À payer") {
                StackedShareChart(segments: PaymentStatus.allCases.map { status in
                    StackedShareChart.Segment(
                        label: settings.label(for: status),
                        value: summary.byStatus[status] ?? 0,
                        color: status.tint
                    )
                })
            }

            AnalyticsCard(title: "Salaire vs dépenses", subtitle: "Sur les 12 mois de \(year)") {
                SalaryVsSpendingChart(points: trendPoints)
            }

            AnalyticsCard(title: "Évolution des dépenses", subtitle: "Mois par mois, \(year)") {
                MonthlyTrendChart(points: trendPoints, highlightedMonth: month)
            }
        }
    }
}

/// Carte standard des écrans d'analyse : en-tête + contenu graphique.
struct AnalyticsCard<Content: View>: View {

    let title: String
    var subtitle: String?
    @ViewBuilder var content: Content

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 16) {
                SectionHeader(title, subtitle: subtitle)
                content
            }
        }
    }
}
