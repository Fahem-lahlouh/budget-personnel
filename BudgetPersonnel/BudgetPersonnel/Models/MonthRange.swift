import Foundation

/// Bornes d'un mois, utilisées pour filtrer les dépenses côté base plutôt que
/// de tout charger en mémoire.
struct MonthRange {

    let start: Date
    let end: Date

    init(year: Int, month: Int) {
        let cal = Calendar.budget
        let startComps = DateComponents(year: year, month: month, day: 1)
        let first = cal.date(from: startComps) ?? Date()
        start = first
        end = cal.date(byAdding: .month, value: 1, to: first) ?? first
    }

    init(year: Int) {
        let cal = Calendar.budget
        let first = cal.date(from: DateComponents(year: year, month: 1, day: 1)) ?? Date()
        start = first
        end = cal.date(byAdding: .year, value: 1, to: first) ?? first
    }
}
