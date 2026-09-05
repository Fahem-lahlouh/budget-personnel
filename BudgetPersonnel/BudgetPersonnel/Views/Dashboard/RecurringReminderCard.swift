import SwiftUI

/// Rappel des dépenses récurrentes du mois qui restent à traiter.
///
/// Deux cas distincts, signalés différemment :
/// - **pas encore saisie** : la ligne n'existe pas dans le mois ;
/// - **saisie mais à payer** : la ligne existe, son statut est « À payer ».
struct RecurringReminderCard: View {

    let statuses: [RecurringStatus]
    let settings: AppSettings
    let onQuickAdd: (RecurringExpense) -> Void
    let onMarkPaid: (RecurringStatus) -> Void

    private var totalDue: Double {
        statuses.reduce(0) { partial, status in
            partial + (status.matched?.amount ?? status.recurring.plannedAmount)
        }
    }

    var body: some View {
        Card {
            VStack(alignment: .leading, spacing: 14) {
                SectionHeader(
                    title: "À ne pas oublier",
                    subtitle: "\(statuses.count) récurrente\(statuses.count > 1 ? "s" : "") en attente"
                ) {
                    AmountText(value: totalDue, style: .row, tint: Palette.warning)
                }

                VStack(spacing: 0) {
                    ForEach(Array(statuses.enumerated()), id: \.element.id) { index, status in
                        row(status)
                        if index < statuses.count - 1 {
                            Divider().overlay(Palette.hairline).padding(.leading, 40)
                        }
                    }
                }
            }
        }
    }

    private func row(_ status: RecurringStatus) -> some View {
        let recurring = status.recurring
        let amount = status.matched?.amount ?? recurring.plannedAmount

        return HStack(spacing: 12) {
            Image(systemName: status.isMissing ? "circle.dashed" : "clock.badge.exclamationmark.fill")
                .font(.body)
                .foregroundStyle(status.isMissing ? Palette.textTertiary : Palette.warning)
                .frame(width: 28)

            VStack(alignment: .leading, spacing: 2) {
                Text(recurring.details)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Palette.textPrimary)
                    .lineLimit(1)

                Text(status.isMissing
                     ? "Prévue le \(Fmt.dayMonth(status.dueDate)) · non saisie"
                     : "Saisie le \(Fmt.dayMonth(status.matched?.date ?? status.dueDate)) · \(settings.label(for: PaymentStatus.aPayer))")
                    .font(.caption)
                    .foregroundStyle(Palette.textSecondary)
                    .lineLimit(1)
            }

            Spacer(minLength: 8)

            AmountText(
                value: amount,
                style: .row,
                isConfidential: recurring.isConfidential,
                tint: Palette.textSecondary
            )

            Button {
                Haptics.tap()
                if status.isMissing { onQuickAdd(recurring) } else { onMarkPaid(status) }
            } label: {
                Image(systemName: status.isMissing ? "plus" : "checkmark")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(Palette.accent)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Palette.accentSoft))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(status.isMissing
                ? "Saisir \(recurring.details)"
                : "Marquer \(recurring.details) comme payée")
        }
        .padding(.vertical, 9)
    }
}

/// Conseils et alertes, repris de la colonne « Alertes & recommandations » du
/// classeur. Un seul message à la fois, choisi selon la situation : plusieurs
/// conseils simultanés se neutralisent.
struct AdviceCard: View {

    let summary: MonthSummary

    @Environment(LockManager.self) private var lock

    private struct Advice {
        let symbol: String
        let tint: Color
        let title: String
        let message: String
    }

    private var advice: Advice {
        if summary.salary <= 0 {
            return Advice(
                symbol: "questionmark.circle.fill",
                tint: Palette.accent,
                title: "Renseignez votre salaire",
                message: "Sans le salaire du mois, l'app ne peut calculer ni le reste disponible, ni l'épargne, ni la jauge de consommation."
            )
        }

        if summary.remaining < 0 {
            return Advice(
                symbol: "exclamationmark.triangle.fill",
                tint: Palette.negative,
                title: "Budget dépassé",
                message: "Vous avez dépensé \(Fmt.money(-summary.remaining)) de plus que votre salaire ce mois-ci."
            )
        }

        if summary.forecastRemaining < 0 {
            return Advice(
                symbol: "chart.line.downtrend.xyaxis",
                tint: Palette.warning,
                title: "Dépassement prévu",
                message: "Avec les récurrentes encore à venir, les dépenses dépasseraient le salaire de \(Fmt.money(-summary.forecastRemaining))."
            )
        }

        if summary.consumption >= 0.8 {
            return Advice(
                symbol: "gauge.with.dots.needle.67percent",
                tint: Palette.warning,
                title: "Plus de 80 % consommé",
                message: "Il reste \(Fmt.money(summary.remaining)) pour finir le mois. Les dépenses variables méritent un coup d'œil."
            )
        }

        if summary.savingsGoal > 0, summary.realSavings >= summary.savingsGoal {
            return Advice(
                symbol: "checkmark.seal.fill",
                tint: Palette.positive,
                title: "Objectif d'épargne atteint",
                message: "Vous mettez de côté \(Fmt.money(summary.realSavings)) ce mois-ci, pour un objectif de \(Fmt.money(summary.savingsGoal))."
            )
        }

        return Advice(
            symbol: "hand.thumbsup.fill",
            tint: Palette.positive,
            title: "Budget sous contrôle",
            message: "Votre épargne réelle est de \(Fmt.money(summary.realSavings)), soit \(Fmt.ratio(summary.realSavings / max(summary.salary, 1))) du salaire."
        )
    }

    var body: some View {
        let advice = self.advice

        Card {
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: advice.symbol)
                    .font(.title3)
                    .foregroundStyle(advice.tint)
                    .frame(width: 38, height: 38)
                    .background(Circle().fill(advice.tint.opacity(0.13)))

                VStack(alignment: .leading, spacing: 4) {
                    Text(advice.title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(Palette.textPrimary)

                    // Ces messages citent des montants : app verrouillée, on
                    // n'en dit que la substance.
                    Text(lock.isLocked ? "Déverrouillez l'app pour voir le détail." : advice.message)
                        .font(.footnote)
                        .foregroundStyle(Palette.textSecondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .accessibilityElement(children: .combine)
    }
}
