import SwiftUI

/// Une ligne de dépense.
///
/// Hiérarchie visuelle : le libellé domine, la catégorie et l'enseigne le
/// contextualisent en second plan, le montant ferme la ligne à droite. L'écart
/// et les étiquettes n'apparaissent que quand ils apportent une information.
struct ExpenseRow: View {

    let expense: Expense
    let settings: AppSettings

    @Environment(LockManager.self) private var lock

    private var symbol: String {
        SeedData.categories.first { $0.name == expense.categoryName }?.symbol ?? "tag.fill"
    }

    private var tint: Color { Palette.color(forName: expense.categoryName) }

    /// Ligne secondaire : catégorie · enseigne, sans séparateur orphelin quand
    /// l'enseigne est vide.
    private var subtitle: String {
        [expense.categoryName, expense.merchantName]
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    private var isHiddenAmount: Bool {
        lock.isLocked || (expense.isConfidential && !lock.isConfidentialRevealed)
    }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(tint.opacity(0.14)).frame(width: 38, height: 38)
                Image(systemName: symbol)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(tint)
            }

            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(expense.details.isEmpty ? expense.categoryName : expense.details)
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Palette.textPrimary)
                        .lineLimit(1)

                    if expense.isConfidential {
                        Image(systemName: "eye.slash.fill")
                            .font(.caption2)
                            .foregroundStyle(Palette.textTertiary)
                            .accessibilityLabel("Dépense confidentielle")
                    }
                }

                if !subtitle.isEmpty {
                    Text(subtitle)
                        .font(.caption)
                        .foregroundStyle(Palette.textSecondary)
                        .lineLimit(1)
                }

                HStack(spacing: 6) {
                    if expense.status == .aPayer {
                        TagChip(
                            text: settings.label(for: .aPayer),
                            symbol: PaymentStatus.aPayer.symbol,
                            tint: Palette.warning
                        )
                    }
                    if expense.type != .variable {
                        TagChip(
                            text: settings.label(for: expense.type),
                            symbol: expense.type.symbol,
                            tint: expense.type.tint
                        )
                    }
                }
                .padding(.top, 1)
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 3) {
                AmountText(value: expense.amount, style: .row, isConfidential: expense.isConfidential)

                if let variance = expense.variance, !isHiddenAmount {
                    varianceBadge(variance)
                }
            }
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(accessibilityDescription)
    }

    /// Écart au budget. Positif = dépassement (rouge), négatif = économie (vert).
    private func varianceBadge(_ variance: Double) -> some View {
        let isOver = variance > 0
        return HStack(spacing: 2) {
            Image(systemName: isOver ? "arrow.up.right" : "arrow.down.right")
                .font(.system(size: 8, weight: .bold))
            Text(Fmt.signedMoney(variance))
                .font(.caption2.weight(.semibold))
                .monospacedDigit()
        }
        .foregroundStyle(isOver ? Palette.negative : Palette.positive)
        .accessibilityLabel(isOver
            ? "Dépassement de \(Fmt.money(variance))"
            : "Économie de \(Fmt.money(-variance))")
    }

    private var accessibilityDescription: String {
        var parts: [String] = [expense.details.isEmpty ? expense.categoryName : expense.details]
        if !subtitle.isEmpty { parts.append(subtitle) }
        parts.append(isHiddenAmount ? "montant masqué" : Fmt.money(expense.amount))
        parts.append(settings.label(for: expense.status))
        return parts.joined(separator: ", ")
    }
}
