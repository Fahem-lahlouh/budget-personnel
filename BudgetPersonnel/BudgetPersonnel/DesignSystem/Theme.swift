import SwiftUI
import UIKit

// MARK: - Couleurs

/// Palette de l'application.
///
/// Toutes les couleurs sont des *dynamic colors* : le mode sombre n'est pas une
/// inversion mécanique, chaque teinte possède sa propre valeur, choisie pour
/// garder un contraste suffisant sur son fond (cible WCAG AA sur le texte).
enum Palette {

    // MARK: Fonds & surfaces

    /// Fond général. Gris légèrement bleuté en clair ; en sombre un noir profond
    /// mais non absolu, pour que les ombres et les élévations restent lisibles.
    static let background = dyn(light: 0xF3F4F8, dark: 0x0A0B0F)

    /// Surface d'une carte.
    static let surface = dyn(light: 0xFFFFFF, dark: 0x15171D)

    /// Surface d'un élément posé *sur* une carte (chip, champ, ligne active).
    static let surfaceRaised = dyn(light: 0xF5F6FA, dark: 0x1E212A)

    /// Filet de séparation, volontairement très discret.
    static let hairline = dyn(light: 0x11131A, dark: 0xFFFFFF, lightAlpha: 0.08, darkAlpha: 0.10)

    // MARK: Texte

    static let textPrimary = dyn(light: 0x0D0F14, dark: 0xF4F5F7)
    static let textSecondary = dyn(light: 0x69707E, dark: 0x9CA3B0)
    static let textTertiary = dyn(light: 0x9AA0AC, dark: 0x6C7280)

    // MARK: Accent & sémantique

    /// Accent de la marque : un indigo profond, éclairci en mode sombre.
    static let accent = dyn(light: 0x5B4BE0, dark: 0x8E7DFF)
    static let accentSoft = dyn(light: 0x5B4BE0, dark: 0x8E7DFF, lightAlpha: 0.12, darkAlpha: 0.20)

    static let positive = dyn(light: 0x0F7A54, dark: 0x3DD9A0)
    static let positiveSoft = dyn(light: 0x0F7A54, dark: 0x3DD9A0, lightAlpha: 0.12, darkAlpha: 0.18)

    static let warning = dyn(light: 0xA85708, dark: 0xF7B94A)
    static let warningSoft = dyn(light: 0xA85708, dark: 0xF7B94A, lightAlpha: 0.13, darkAlpha: 0.18)

    static let negative = dyn(light: 0xBE2639, dark: 0xFF6B72)
    static let negativeSoft = dyn(light: 0xBE2639, dark: 0xFF6B72, lightAlpha: 0.12, darkAlpha: 0.18)

    /// Dégradé d'accent, utilisé sur l'anneau de budget et les boutons pleins.
    static var accentGradient: LinearGradient {
        LinearGradient(
            colors: [dyn(light: 0x6E5CF0, dark: 0x9E8DFF), dyn(light: 0x4436C4, dark: 0x6F5CF0)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: Palette catégories

    /// 15 teintes distinctes, assez désaturées pour cohabiter dans un donut
    /// sans donner l'impression d'un camaïeu de bonbons.
    static let categoryPalette: [Color] = [
        dyn(light: 0x5B4BE0, dark: 0x8E7DFF), // indigo
        dyn(light: 0x0E7C86, dark: 0x2FC6D1), // sarcelle
        dyn(light: 0xA85708, dark: 0xF7B94A), // ambre
        dyn(light: 0xB33063, dark: 0xFF7BA6), // rose
        dyn(light: 0x0F7A54, dark: 0x3DD9A0), // vert
        dyn(light: 0x1D5FD1, dark: 0x6BA5FF), // bleu
        dyn(light: 0x7C34C0, dark: 0xC08CFF), // violet
        dyn(light: 0xC03A2D, dark: 0xFF8A76), // corail
        dyn(light: 0x66761A, dark: 0xBBCF4A), // olive
        dyn(light: 0x0B6E9E, dark: 0x54BEEE), // cyan
        dyn(light: 0x94481F, dark: 0xE59264), // brique
        dyn(light: 0x51458C, dark: 0xA79BE8), // prune
        dyn(light: 0x84652C, dark: 0xD8B268), // sable
        dyn(light: 0x187466, dark: 0x5FD9C2), // menthe
        dyn(light: 0x58626F, dark: 0x9AA6B8)  // ardoise
    ]

    /// Couleur stable pour un libellé donné : même catégorie = même teinte,
    /// d'un écran à l'autre et d'un lancement à l'autre.
    static func color(forName name: String) -> Color {
        categoryPalette[abs(name.stableHash) % categoryPalette.count]
    }

    // MARK: Fabrique

    static func dyn(light: UInt32, dark: UInt32, lightAlpha: Double = 1, darkAlpha: Double = 1) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(rgb: dark, alpha: darkAlpha)
                : UIColor(rgb: light, alpha: lightAlpha)
        })
    }
}

extension UIColor {
    convenience init(rgb: UInt32, alpha: Double = 1) {
        self.init(
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255,
            alpha: alpha
        )
    }
}

extension String {
    /// Hash déterministe entre deux lancements (contrairement à `hashValue`,
    /// qui est salé aléatoirement au démarrage du process).
    var stableHash: Int {
        var result = 5381
        for byte in utf8 {
            result = (result &* 33) &+ Int(byte)
        }
        return result
    }
}

// MARK: - Métriques

enum Metrics {
    /// Rayon des cartes. Un seul rayon dans toute l'app, décliné en plus petit
    /// pour les éléments imbriqués (règle du « concentric corner radius »).
    static let cardRadius: CGFloat = 22
    static let innerRadius: CGFloat = 14
    static let chipRadius: CGFloat = 12

    static let gutter: CGFloat = 18       // marge horizontale de l'écran
    static let cardPadding: CGFloat = 18
    static let stackSpacing: CGFloat = 14
}

// MARK: - Typographie

extension Font {
    /// Grand montant mis en avant (hero du tableau de bord).
    static func amountHero() -> Font { .system(size: 40, weight: .semibold, design: .rounded) }
    /// Montant d'une tuile KPI.
    static func amountTile() -> Font { .system(.title2, design: .rounded).weight(.semibold) }
    /// Montant dans une ligne de liste.
    static func amountRow() -> Font { .system(.callout, design: .rounded).weight(.semibold) }
    /// Sur-titre d'une section : petites capitales espacées.
    static func sectionLabel() -> Font { .system(.footnote, design: .default).weight(.semibold) }
}

extension View {
    /// Sur-titre de section, style « small caps » espacé.
    func sectionLabelStyle() -> some View {
        self.font(.sectionLabel())
            .textCase(.uppercase)
            .kerning(0.6)
            .foregroundStyle(Palette.textTertiary)
    }
}

// MARK: - Retour haptique

enum Haptics {
    static func tap() {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }

    static func selection() {
        UISelectionFeedbackGenerator().selectionChanged()
    }

    static func success() {
        UINotificationFeedbackGenerator().notificationOccurred(.success)
    }

    static func warning() {
        UINotificationFeedbackGenerator().notificationOccurred(.warning)
    }

    static func error() {
        UINotificationFeedbackGenerator().notificationOccurred(.error)
    }
}

// MARK: - Animations

enum Motion {
    /// Ressort standard : présent, mais jamais rebondissant.
    static let spring = Animation.spring(response: 0.42, dampingFraction: 0.82)
    /// Ressort plus rapide, pour les micro-interactions (chips, toggles).
    static let quick = Animation.spring(response: 0.28, dampingFraction: 0.86)
    /// Apparition progressive des graphiques.
    static let chart = Animation.easeOut(duration: 0.65)
}
