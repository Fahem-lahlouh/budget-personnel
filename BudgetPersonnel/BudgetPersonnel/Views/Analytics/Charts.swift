import SwiftUI
import Charts

// MARK: - Donut par catégorie

/// Répartition des dépenses par catégorie : top 5 + regroupement « Autres ».
///
/// Le total s'affiche au centre du donut ; toucher un secteur met la catégorie
/// correspondante en avant plutôt que d'ouvrir une infobulle, plus fiable au
/// doigt sur un anneau fin.
struct CategoryDonutChart: View {

    let totals: [NamedTotal]
    var total: Double

    @State private var highlighted: String?
    @State private var appeared = false

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var slices: [NamedTotal] { BudgetEngine.topWithOthers(totals, limit: 5) }

    private var focused: NamedTotal? {
        guard let highlighted else { return nil }
        return slices.first { $0.name == highlighted }
    }

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Chart(slices) { slice in
                    SectorMark(
                        angle: .value("Montant", slice.amount),
                        innerRadius: .ratio(0.64),
                        outerRadius: .ratio(highlighted == slice.name ? 1.0 : 0.92),
                        angularInset: 2
                    )
                    .cornerRadius(5)
                    .foregroundStyle(color(for: slice.name))
                    .opacity(highlighted == nil || highlighted == slice.name ? 1 : 0.32)
                }
                .chartLegend(.hidden)
                .frame(height: 210)
                .animation(Motion.quick, value: highlighted)
                .scaleEffect(appeared ? 1 : 0.9)
                .opacity(appeared ? 1 : 0)

                VStack(spacing: 2) {
                    Text(focused?.name ?? "Total")
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                        .lineLimit(1)

                    AmountText(value: focused?.amount ?? total, style: .tile)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)

                    if let focused {
                        Text(Fmt.ratio(focused.share))
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(color(for: focused.name))
                            .monospacedDigit()
                    }
                }
                .frame(maxWidth: 120)
                .allowsHitTesting(false)
            }

            // Légende : elle sert aussi de sélecteur, ce qui la rend utilisable
            // au doigt et accessible à VoiceOver (contrairement au donut seul).
            LazyVGrid(
                columns: [GridItem(.flexible(), alignment: .leading),
                          GridItem(.flexible(), alignment: .leading)],
                spacing: 9
            ) {
                ForEach(slices) { slice in
                    Button {
                        Haptics.selection()
                        withAnimation(Motion.quick) {
                            highlighted = highlighted == slice.name ? nil : slice.name
                        }
                    } label: {
                        HStack(spacing: 7) {
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(color(for: slice.name))
                                .frame(width: 10, height: 10)

                            Text(slice.name)
                                .font(.caption)
                                .foregroundStyle(Palette.textPrimary)
                                .lineLimit(1)

                            Spacer(minLength: 2)

                            Text(Fmt.ratio(slice.share))
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Palette.textSecondary)
                                .monospacedDigit()
                        }
                        .opacity(highlighted == nil || highlighted == slice.name ? 1 : 0.45)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(slice.name), \(Fmt.money(slice.amount)), \(Fmt.ratio(slice.share))")
                }
            }
        }
        .onAppear {
            if reduceMotion { appeared = true }
            else { withAnimation(Motion.chart.delay(0.05)) { appeared = true } }
        }
    }

    private func color(for name: String) -> Color {
        name == "Autres" && !totals.contains(where: { $0.name == "Autres" })
            ? Palette.textTertiary
            : Palette.color(forName: name)
    }
}

// MARK: - Salaire vs dépenses

struct SalaryVsSpendingPoint: Identifiable {
    let month: Int
    let salary: Double
    let spent: Double
    var id: Int { month }
}

/// Barres groupées salaire / dépenses, mois par mois.
struct SalaryVsSpendingChart: View {

    let points: [SalaryVsSpendingPoint]

    private struct Bar: Identifiable {
        let month: Int
        let series: String
        let value: Double
        var id: String { "\(month)-\(series)" }
    }

    private var bars: [Bar] {
        points.flatMap { point in
            [
                Bar(month: point.month, series: "Salaire", value: point.salary),
                Bar(month: point.month, series: "Dépenses", value: point.spent)
            ]
        }
    }

    var body: some View {
        Chart(bars) { bar in
            BarMark(
                x: .value("Mois", Fmt.monthAbbrev(bar.month)),
                y: .value("Montant", bar.value),
                width: .fixed(9)
            )
            .position(by: .value("Série", bar.series))
            .foregroundStyle(by: .value("Série", bar.series))
            .cornerRadius(3)
        }
        .chartForegroundStyleScale([
            "Salaire": Palette.accent,
            "Dépenses": Palette.negative
        ])
        .chartLegend(position: .bottom, spacing: 12)
        .chartYAxis { compactYAxis() }
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel {
                    if let label = value.as(String.self) {
                        Text(label).font(.caption2).foregroundStyle(Palette.textTertiary)
                    }
                }
            }
        }
        .frame(height: 220)
    }
}

// MARK: - Évolution annuelle

/// Dépenses mois par mois, avec le mois courant mis en avant.
struct MonthlyTrendChart: View {

    let points: [SalaryVsSpendingPoint]
    var highlightedMonth: Int?

    var body: some View {
        Chart(points) { point in
            BarMark(
                x: .value("Mois", Fmt.monthAbbrev(point.month)),
                y: .value("Dépenses", point.spent),
                width: .fixed(18)
            )
            .cornerRadius(5)
            .foregroundStyle(
                point.month == highlightedMonth
                    ? AnyShapeStyle(Palette.accentGradient)
                    : AnyShapeStyle(Palette.accent.opacity(0.35))
            )
        }
        .chartYAxis { compactYAxis() }
        .chartXAxis {
            AxisMarks { value in
                AxisValueLabel {
                    if let label = value.as(String.self) {
                        Text(label).font(.caption2).foregroundStyle(Palette.textTertiary)
                    }
                }
            }
        }
        .frame(height: 200)
    }
}

// MARK: - Barre empilée

/// Répartition en une seule barre horizontale, avec sa légende.
/// Utilisée pour Fixe / Variable / Exceptionnel et pour Payé / À payer.
struct StackedShareChart: View {

    struct Segment: Identifiable {
        let label: String
        let value: Double
        let color: Color
        var id: String { label }
    }

    let segments: [Segment]

    private var total: Double { segments.reduce(0) { $0 + $1.value } }
    private var visible: [Segment] { segments.filter { $0.value > 0 } }

    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            GeometryReader { geo in
                HStack(spacing: 3) {
                    ForEach(visible) { segment in
                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                            .fill(segment.color)
                            .frame(width: width(for: segment, in: geo.size.width))
                    }
                }
            }
            .frame(height: 16)
            .accessibilityHidden(true)

            VStack(spacing: 9) {
                ForEach(visible) { segment in
                    HStack(spacing: 8) {
                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                            .fill(segment.color)
                            .frame(width: 10, height: 10)

                        Text(segment.label)
                            .font(.subheadline)
                            .foregroundStyle(Palette.textPrimary)

                        Spacer(minLength: 8)

                        Text(total > 0 ? Fmt.ratio(segment.value / total) : "—")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Palette.textSecondary)
                            .monospacedDigit()

                        AmountText(value: segment.value, style: .row)
                            .frame(minWidth: 84, alignment: .trailing)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("\(segment.label), \(Fmt.money(segment.value))")
                }
            }
        }
        .onAppear {
            if reduceMotion { appeared = true }
            else { withAnimation(Motion.chart) { appeared = true } }
        }
    }

    private func width(for segment: Segment, in available: CGFloat) -> CGFloat {
        guard total > 0 else { return 0 }
        let spacing = CGFloat(max(0, visible.count - 1)) * 3
        let usable = max(0, available - spacing)
        let full = usable * CGFloat(segment.value / total)
        return appeared ? full : 0
    }
}

// MARK: - Axe partagé

/// Axe des ordonnées commun aux graphiques : peu de graduations, montants
/// abrégés, filets discrets — l'axe ne doit pas concurrencer les données.
@AxisContentBuilder
private func compactYAxis() -> some AxisContent {
    AxisMarks(position: .leading, values: .automatic(desiredCount: 4)) { value in
        AxisGridLine().foregroundStyle(Palette.hairline)
        AxisValueLabel {
            if let amount = value.as(Double.self) {
                Text(Fmt.moneyShort(amount))
                    .font(.caption2)
                    .foregroundStyle(Palette.textTertiary)
            }
        }
    }
}
