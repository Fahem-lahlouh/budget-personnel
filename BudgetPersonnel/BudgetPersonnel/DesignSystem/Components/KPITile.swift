import SwiftUI

/// Tuile d'indicateur : pictogramme teinté, libellé, montant, sous-titre.
///
/// Les tuiles se rangent en grille adaptative ; leur hauteur est alignée par la
/// grille elle-même, ce qui évite les décalages quand un sous-titre passe sur
/// deux lignes.
struct KPITile: View {

    let symbol: String
    let title: String
    let value: Double
    var subtitle: String?
    var tint: Color = Palette.accent
    var isConfidential: Bool = false
    var signed: Bool = false

    var body: some View {
        Card(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: symbol)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(tint)
                        .frame(width: 26, height: 26)
                        .background(Circle().fill(tint.opacity(0.13)))

                    Text(title)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(Palette.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }

                AmountText(
                    value: value,
                    style: .tile,
                    isConfidential: isConfidential,
                    signed: signed,
                    tint: tint == Palette.accent ? Palette.textPrimary : tint
                )
                .lineLimit(1)
                .minimumScaleFactor(0.6)

                if let subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(Palette.textTertiary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// Petite tuile texte, pour les indicateurs non monétaires (nombre de dépenses,
/// mois le plus dépensier…).
struct InfoTile: View {

    let symbol: String
    let title: String
    let value: String
    var subtitle: String?
    var tint: Color = Palette.accent

    var body: some View {
        Card(padding: 16) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: symbol)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(tint)
                        .frame(width: 26, height: 26)
                        .background(Circle().fill(tint.opacity(0.13)))

                    Text(title)
                        .font(.footnote.weight(.medium))
                        .foregroundStyle(Palette.textSecondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.85)
                }

                Text(value)
                    .font(.amountTile())
                    .monospacedDigit()
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)

                if let subtitle {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(Palette.textTertiary)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
