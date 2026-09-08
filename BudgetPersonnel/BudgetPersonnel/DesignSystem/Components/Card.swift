import SwiftUI

/// Carte de base : surface, rayon continu, ombre douce.
///
/// L'ombre est volontairement large et très peu opaque en mode clair, et
/// remplacée par un liseré en mode sombre — une ombre noire sur fond noir ne se
/// voit pas, c'est le contour qui crée l'élévation.
struct Card<Content: View>: View {

    var padding: CGFloat = Metrics.cardPadding
    @ViewBuilder var content: Content

    @Environment(\.colorScheme) private var scheme

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous)
                    .fill(Palette.surface)
                    .shadow(
                        color: .black.opacity(scheme == .dark ? 0 : 0.05),
                        radius: 18, x: 0, y: 8
                    )
            }
            .overlay {
                RoundedRectangle(cornerRadius: Metrics.cardRadius, style: .continuous)
                    .strokeBorder(Palette.hairline, lineWidth: scheme == .dark ? 1 : 0.5)
            }
    }
}

/// En-tête de section : sur-titre + action optionnelle à droite.
struct SectionHeader<Trailing: View>: View {

    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).sectionLabelStyle()
                if let subtitle {
                    Text(subtitle)
                        .font(.subheadline)
                        .foregroundStyle(Palette.textSecondary)
                }
            }
            Spacer(minLength: 12)
            trailing
        }
        .accessibilityElement(children: .combine)
    }
}

extension SectionHeader where Trailing == EmptyView {
    init(_ title: String, subtitle: String? = nil) {
        self.init(title: title, subtitle: subtitle) { EmptyView() }
    }
}

/// Message d'état vide, utilisé quand une liste ou un graphique n'a rien à
/// montrer. Toujours accompagné d'une action, jamais d'un simple « Aucune
/// donnée » qui laisse l'utilisateur sans porte de sortie.
struct EmptyStateView: View {

    let symbol: String
    let title: String
    let message: String
    var actionTitle: String?
    var action: (() -> Void)?

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: symbol)
                .font(.system(size: 34, weight: .light))
                .foregroundStyle(Palette.accent)
                .padding(18)
                .background(Circle().fill(Palette.accentSoft))

            Text(title)
                .font(.headline)
                .foregroundStyle(Palette.textPrimary)

            Text(message)
                .font(.subheadline)
                .foregroundStyle(Palette.textSecondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)

            if let actionTitle, let action {
                Button(actionTitle) {
                    Haptics.tap()
                    action()
                }
                .buttonStyle(PillButtonStyle())
                .padding(.top, 4)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 26)
        .padding(.horizontal, 20)
    }
}

/// Bouton plein, arrondi, avec le dégradé d'accent.
struct PillButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(Capsule().fill(Palette.accentGradient))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(Motion.quick, value: configuration.isPressed)
    }
}

/// Bouton discret, sur fond teinté.
struct SoftButtonStyle: ButtonStyle {
    var tint: Color = Palette.accent
    var background: Color = Palette.accentSoft

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(tint)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Capsule().fill(background))
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
            .animation(Motion.quick, value: configuration.isPressed)
    }
}

/// Étiquette compacte, colorée, pour un type ou un statut.
struct TagChip: View {

    let text: String
    var symbol: String?
    var tint: Color = Palette.accent

    var body: some View {
        HStack(spacing: 4) {
            if let symbol {
                Image(systemName: symbol).font(.caption2.weight(.semibold))
            }
            Text(text).font(.caption.weight(.semibold))
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(Capsule().fill(tint.opacity(0.13)))
    }
}
