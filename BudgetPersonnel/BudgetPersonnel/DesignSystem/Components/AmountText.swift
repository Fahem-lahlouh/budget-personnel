import SwiftUI

/// Affiche un montant en respectant l'état de confidentialité.
///
/// C'est le **seul** composant qui met un montant à l'écran : tant qu'il est
/// utilisé partout, il devient impossible d'oublier de masquer une valeur
/// quelque part. Un montant est masqué si l'app est verrouillée, ou si la
/// dépense est marquée confidentielle et que le second niveau n'a pas été ouvert.
struct AmountText: View {

    enum Style {
        case hero, tile, row, caption

        var font: Font {
            switch self {
            case .hero: return .amountHero()
            case .tile: return .amountTile()
            case .row: return .amountRow()
            case .caption: return .system(.caption, design: .rounded).weight(.semibold)
            }
        }
    }

    let value: Double
    var style: Style = .row
    /// La dépense d'origine est marquée « Confidentiel ».
    var isConfidential: Bool = false
    /// Affiche le signe (utilisé pour les écarts).
    var signed: Bool = false
    var tint: Color?

    @Environment(LockManager.self) private var lock

    private var isMasked: Bool {
        lock.isLocked || (isConfidential && !lock.isConfidentialRevealed)
    }

    private var text: String {
        if isMasked { return Fmt.masked }
        return signed ? Fmt.signedMoney(value) : Fmt.money(value)
    }

    var body: some View {
        Text(text)
            .font(style.font)
            .monospacedDigit()
            .foregroundStyle(isMasked ? Palette.textTertiary : (tint ?? Palette.textPrimary))
            .contentTransition(.numericText())
            .animation(Motion.quick, value: isMasked)
            .animation(Motion.quick, value: value)
            .accessibilityLabel(isMasked ? "Montant masqué" : text)
    }
}

/// Variante compacte pour les axes de graphiques et les libellés serrés.
struct CompactAmountText: View {

    let value: Double
    var isConfidential: Bool = false

    @Environment(LockManager.self) private var lock

    var body: some View {
        let masked = lock.isLocked || (isConfidential && !lock.isConfidentialRevealed)
        Text(masked ? "••• €" : Fmt.moneyShort(value))
            .monospacedDigit()
            .accessibilityLabel(masked ? "Montant masqué" : Fmt.money(value))
    }
}
