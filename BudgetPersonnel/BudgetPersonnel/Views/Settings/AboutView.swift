import SwiftUI

/// À propos : ce que l'app fait, ce qu'elle ne fait pas, et pourquoi.
///
/// Cet écran existe pour que les limites soient lisibles dans l'app elle-même,
/// et pas seulement dans un README que l'on oublie.
struct AboutView: View {

    private var version: String {
        let info = Bundle.main.infoDictionary
        let short = info?["CFBundleShortVersionString"] as? String ?? "1.0"
        let build = info?["CFBundleVersion"] as? String ?? "1"
        return "Version \(short) (\(build))"
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Budget Personnel")
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                    Text(version)
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                }
                .padding(.vertical, 4)
            }
            .listRowBackground(Palette.surface)

            block(
                symbol: "iphone",
                tint: Palette.accent,
                title: "Tout reste sur cet iPhone",
                text: """
                Les dépenses sont enregistrées en local avec SwiftData. Aucun compte, aucun serveur, aucune connexion internet nécessaire au quotidien. Rien n'est envoyé nulle part.
                """
            )

            block(
                symbol: "icloud",
                tint: Palette.accent,
                title: "Synchronisation iCloud : possible, pas activée",
                text: """
                La synchronisation entre appareils via iCloud (CloudKit) est incluse dans un compte Apple, sans surcoût. Elle n'est pas activée ici : l'activer demande d'ajouter la capacité CloudKit dans Xcode et de retirer les contraintes d'unicité du modèle de données, que CloudKit ne sait pas reproduire. La marche à suivre est détaillée dans le README du projet.
                """
            )

            block(
                symbol: "lock.shield",
                tint: Palette.positive,
                title: "Ce que le code PIN protège vraiment",
                text: """
                Le code est enregistré haché (SHA-256 + sel aléatoire) dans le Trousseau iOS, jamais en clair, et ne quitte pas l'appareil.

                Il protège l'affichage des montants dans l'app. Ce n'est pas un coffre-fort chiffré séparé : la base de données est protégée par le chiffrement du système, c'est-à-dire par le code de déverrouillage de votre iPhone. Quelqu'un qui aurait votre iPhone déverrouillé et accès à une sauvegarde pourrait lire les données sans connaître ce code PIN.
                """
            )

            block(
                symbol: "calendar.badge.exclamationmark",
                tint: Palette.warning,
                title: "Installation : la limite des 7 jours",
                text: """
                Installée depuis Xcode avec un compte Apple gratuit, l'app cesse de s'ouvrir au bout de 7 jours : c'est la durée de validité du certificat de signature, une règle d'Apple, pas un défaut de l'app.

                Il suffit de la réinstaller depuis Xcode pour repartir pour 7 jours — les données déjà saisies sont conservées tant que l'app n'est pas supprimée de l'iPhone. Un compte développeur Apple payant porte cette durée à un an. Aucun moyen gratuit ne permet de contourner cette limite.
                """
            )

            block(
                symbol: "square.and.arrow.up",
                tint: Palette.accent,
                title: "Vos données vous appartiennent",
                text: """
                L'export CSV des Réglages produit un fichier lisible dans Excel et Numbers, que vous pouvez conserver ou transférer où vous voulez. Faites-en un avant toute réinstallation ou suppression de l'app.
                """
            )

            block(
                symbol: "exclamationmark.triangle",
                tint: Palette.textSecondary,
                title: "Ce que l'app ne fait pas",
                text: """
                Aucune connexion à une banque, aucun import automatique d'opérations : cela suppose un agrégateur bancaire, tous payants. Les dépenses se saisissent à la main, comme dans le classeur d'origine.

                Aucune sauvegarde automatique hors de l'appareil tant qu'iCloud n'est pas activé. La sauvegarde iCloud de l'iPhone, elle, inclut bien les données de l'app.
                """
            )
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(Palette.background)
        .navigationTitle("À propos")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func block(symbol: String, tint: Color, title: String, text: String) -> some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 10) {
                    Image(systemName: symbol)
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(tint)
                        .frame(width: 30, height: 30)
                        .background(Circle().fill(tint.opacity(0.14)))

                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)
                }

                Text(text)
                    .font(.footnote)
                    .foregroundStyle(Palette.textSecondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.vertical, 6)
        }
        .listRowBackground(Palette.surface)
    }
}
