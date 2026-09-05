import SwiftUI

/// Anneau de consommation du budget.
///
/// Code couleur demandé : vert en dessous de 80 %, orange entre 80 et 100 %,
/// rouge au-delà. Au-delà de 100 %, un second arc plus fin se superpose pour
/// matérialiser le dépassement sans faire « déborder » l'anneau principal.
struct BudgetRing: View {

    /// Part du budget consommée (`1` = 100 %). Peut dépasser `1`.
    let ratio: Double
    /// Montant dépensé, affiché au centre.
    let spent: Double
    /// Libellé secondaire sous le montant.
    let caption: String

    var lineWidth: CGFloat = 16
    var diameter: CGFloat = 190

    @State private var animatedRatio: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var clamped: Double { min(animatedRatio, 1) }
    private var overflow: Double { max(0, min(animatedRatio - 1, 1)) }

    private var tint: Color {
        if ratio > 1 { return Palette.negative }
        if ratio >= 0.8 { return Palette.warning }
        return Palette.positive
    }

    var body: some View {
        ZStack {
            // Rail
            Circle()
                .stroke(Palette.surfaceRaised, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))

            // Arc principal
            Circle()
                .trim(from: 0, to: clamped)
                .stroke(
                    AngularGradient(
                        colors: [tint.opacity(0.65), tint],
                        center: .center,
                        startAngle: .degrees(-90),
                        endAngle: .degrees(270)
                    ),
                    style: StrokeStyle(lineWidth: lineWidth, lineCap: .round)
                )
                .rotationEffect(.degrees(-90))

            // Arc de dépassement, posé par-dessus, plus fin
            if overflow > 0 {
                Circle()
                    .trim(from: 0, to: overflow)
                    .stroke(
                        Palette.negative,
                        style: StrokeStyle(lineWidth: lineWidth * 0.42, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .shadow(color: Palette.negative.opacity(0.4), radius: 6)
            }

            VStack(spacing: 4) {
                Text(Fmt.ratio(ratio))
                    .font(.system(size: 13, weight: .semibold, design: .rounded))
                    .foregroundStyle(tint)
                    .monospacedDigit()

                AmountText(value: spent, style: .hero)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)

                Text(caption)
                    .font(.caption)
                    .foregroundStyle(Palette.textSecondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal, lineWidth + 12)
        }
        .frame(width: diameter, height: diameter)
        .onAppear { animate(to: ratio) }
        .onChange(of: ratio) { _, newValue in animate(to: newValue) }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Consommation du budget")
        .accessibilityValue("\(Fmt.ratio(ratio)) du salaire utilisé")
    }

    private func animate(to value: Double) {
        if reduceMotion {
            animatedRatio = value
        } else {
            // Léger délai : l'anneau se dessine une fois la carte en place,
            // ce qui rend l'apparition lisible plutôt que simultanée.
            withAnimation(Motion.chart.delay(0.08)) { animatedRatio = value }
        }
    }
}

/// Barre de progression fine, utilisée dans les classements (catégories,
/// enseignes) et pour l'objectif d'épargne.
struct ProgressBar: View {

    /// Valeur entre 0 et 1.
    let value: Double
    var tint: Color = Palette.accent
    var height: CGFloat = 8

    @State private var animated: Double = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(Palette.surfaceRaised)
                Capsule()
                    .fill(tint)
                    .frame(width: max(0, min(1, animated)) * geo.size.width)
            }
        }
        .frame(height: height)
        .onAppear {
            if reduceMotion { animated = value }
            else { withAnimation(Motion.chart) { animated = value } }
        }
        .onChange(of: value) { _, newValue in
            if reduceMotion { animated = newValue }
            else { withAnimation(Motion.chart) { animated = newValue } }
        }
        .accessibilityHidden(true)
    }
}

/// Ligne d'un classement : pastille de couleur, libellé, montant et barre.
struct RankRow: View {

    let rank: Int
    let name: String
    let amount: Double
    let share: Double
    var color: Color
    var symbol: String?

    var body: some View {
        VStack(spacing: 7) {
            HStack(spacing: 10) {
                ZStack {
                    Circle().fill(color.opacity(0.15)).frame(width: 30, height: 30)
                    if let symbol {
                        Image(systemName: symbol)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(color)
                    } else {
                        Text("\(rank)")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(color)
                            .monospacedDigit()
                    }
                }

                Text(name)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(1)

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 1) {
                    AmountText(value: amount, style: .row)
                    Text(Fmt.ratio(share))
                        .font(.caption2)
                        .foregroundStyle(Palette.textTertiary)
                        .monospacedDigit()
                }
            }

            ProgressBar(value: share, tint: color, height: 6)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name), \(Fmt.money(amount)), \(Fmt.ratio(share)) du total")
    }
}
