import SwiftUI
import SwiftData

/// Vue annuelle présentée en feuille depuis le tableau de bord.
struct YearView: View {

    let year: Int
    let settings: AppSettings

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: Metrics.stackSpacing) {
                    YearAnalyticsContent(year: year, settings: settings)
                }
                .padding(.horizontal, Metrics.gutter)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .background(Palette.background)
            .navigationTitle("Année \(String(year))")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) { PrivacyToggleButton() }
                ToolbarItem(placement: .confirmationAction) {
                    Button("OK") { dismiss() }
                }
            }
        }
    }
}

/// Synthèse annuelle : mêmes indicateurs qu'un mois, mais cumulés sur 12 mois,
/// plus le détail mois par mois repris du tableau de bord du classeur.
struct YearAnalyticsContent: View {

    let year: Int
    let settings: AppSettings

    @Query private var expenses: [Expense]
    @Query(sort: \RecurringExpense.sortOrder) private var recurring: [RecurringExpense]
    @Query private var budgets: [MonthBudget]

    init(year: Int, settings: AppSettings) {
        self.year = year
        self.settings = settings

        let range = MonthRange(year: year)
        let start = range.start
        let end = range.end
        _expenses = Query(filter: #Predicate<Expense> { $0.date >= start && $0.date < end })
        _budgets = Query(filter: #Predicate<MonthBudget> { $0.year == year })
    }

    private var summary: YearSummary {
        BudgetEngine.summarizeYear(expenses: expenses, recurring: recurring, budgets: budgets, year: year)
    }

    private var points: [SalaryVsSpendingPoint] {
        summary.months.map { SalaryVsSpendingPoint(month: $0.month, salary: $0.salary, spent: $0.total) }
    }

    var body: some View {
        let summary = self.summary

        if summary.count == 0 {
            Card {
                EmptyStateView(
                    symbol: "calendar",
                    title: "Aucune donnée en \(String(year))",
                    message: "Saisissez des dépenses sur l'un des mois de l'année pour voir la synthèse annuelle."
                )
            }
        } else {
            kpiGrid(summary)

            AnalyticsCard(title: "Évolution des dépenses", subtitle: "12 mois de \(String(year))") {
                MonthlyTrendChart(points: points)
            }

            AnalyticsCard(title: "Salaire vs dépenses", subtitle: "Mois par mois") {
                SalaryVsSpendingChart(points: points)
            }

            AnalyticsCard(title: "Répartition par catégorie", subtitle: "Cumul annuel — top 5 et « Autres »") {
                CategoryDonutChart(totals: summary.byCategory, total: summary.total)
            }

            AnalyticsCard(title: "Enseignes", subtitle: "Cumul annuel") {
                if summary.byMerchant.isEmpty {
                    Text("Aucune enseigne renseignée cette année.")
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                } else {
                    VStack(spacing: 12) {
                        ForEach(Array(summary.byMerchant.prefix(8).enumerated()), id: \.element.id) { index, item in
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

            AnalyticsCard(title: "Nature des dépenses", subtitle: "Cumul annuel") {
                StackedShareChart(segments: ExpenseType.allCases.map { type in
                    StackedShareChart.Segment(label: settings.label(for: type), value: summary.byType[type] ?? 0, color: type.tint)
                })
            }

            AnalyticsCard(title: "État de règlement", subtitle: "Cumul annuel") {
                StackedShareChart(segments: PaymentStatus.allCases.map { status in
                    StackedShareChart.Segment(label: settings.label(for: status), value: summary.byStatus[status] ?? 0, color: status.tint)
                })
            }

            monthlyBreakdown(summary)
        }
    }

    // MARK: - Indicateurs annuels

    private func kpiGrid(_ summary: YearSummary) -> some View {
        LazyVGrid(
            columns: [GridItem(.flexible(), spacing: Metrics.stackSpacing),
                      GridItem(.flexible(), spacing: Metrics.stackSpacing)],
            spacing: Metrics.stackSpacing
        ) {
            KPITile(
                symbol: "eurosign.circle.fill",
                title: "Salaire annuel",
                value: summary.salary,
                subtitle: "12 mois cumulés",
                tint: Palette.accent
            )

            KPITile(
                symbol: "arrow.down.circle.fill",
                title: "Dépenses annuelles",
                value: summary.total,
                subtitle: summary.salary > 0 ? "\(Fmt.ratio(summary.consumption)) du salaire" : nil,
                tint: Palette.negative
            )

            KPITile(
                symbol: "banknote.fill",
                title: "Épargne cumulée",
                value: summary.realSavings,
                subtitle: summary.salary > 0 ? "\(Fmt.ratio(summary.realSavings / summary.salary)) du salaire" : nil,
                tint: Palette.positive
            )

            KPITile(
                symbol: "calendar.badge.clock",
                title: "Moyenne / mois",
                value: summary.monthlyAverage,
                subtitle: "Sur les mois renseignés",
                tint: Palette.warning
            )

            InfoTile(
                symbol: "list.number",
                title: "Dépenses",
                value: "\(summary.count)",
                subtitle: "sur l'année",
                tint: Palette.accent
            )

            InfoTile(
                symbol: "trophy.fill",
                title: "Mois le plus dépensier",
                value: summary.busiestMonth.map { Fmt.monthName($0.month) } ?? "—",
                subtitle: summary.busiestMonth.map { _ in "Dépenses les plus élevées" },
                tint: Palette.warning
            )
        }
    }

    // MARK: - Détail mensuel

    private func monthlyBreakdown(_ summary: YearSummary) -> some View {
        Card(padding: 0) {
            VStack(spacing: 0) {
                SectionHeader("Détail mensuel", subtitle: "Salaire, dépenses et reste par mois")
                    .padding(.horizontal, Metrics.cardPadding)
                    .padding(.top, Metrics.cardPadding)
                    .padding(.bottom, 12)

                ForEach(Array(summary.months.enumerated()), id: \.element.month) { index, month in
                    monthRow(month)
                    if index < summary.months.count - 1 {
                        Divider().overlay(Palette.hairline).padding(.leading, Metrics.cardPadding)
                    }
                }
            }
            .padding(.bottom, 6)
        }
    }

    private func monthRow(_ month: MonthSummary) -> some View {
        HStack(spacing: 12) {
            Text(Fmt.monthName(month.month))
                .font(.subheadline.weight(month.total > 0 ? .medium : .regular))
                .foregroundStyle(month.total > 0 ? Palette.textPrimary : Palette.textTertiary)
                .frame(width: 82, alignment: .leading)

            if month.total > 0 {
                ProgressBar(
                    value: month.consumption,
                    tint: month.consumption > 1 ? Palette.negative
                        : (month.consumption >= 0.8 ? Palette.warning : Palette.positive),
                    height: 6
                )
            } else {
                Text("Aucune dépense")
                    .font(.caption)
                    .foregroundStyle(Palette.textTertiary)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            AmountText(value: month.total, style: .caption, tint: Palette.textSecondary)
                .frame(minWidth: 78, alignment: .trailing)
        }
        .padding(.horizontal, Metrics.cardPadding)
        .padding(.vertical, 11)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(Fmt.monthName(month.month)) : \(Fmt.money(month.total)) dépensés")
    }
}
