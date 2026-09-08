import Foundation

/// Formatage monétaire et de dates, centralisé pour que l'app parle d'une seule
/// voix — et pour éviter de recréer un `NumberFormatter` à chaque cellule, ce
/// qui coûte cher dans une liste qui défile.
enum Fmt {

    static let locale = Locale(identifier: "fr_FR")

    // MARK: Formatteurs (privés, instanciés une seule fois)

    private static let currencyFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "EUR"
        f.locale = locale
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        return f
    }()

    private static let compactCurrencyFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "EUR"
        f.locale = locale
        f.maximumFractionDigits = 0
        return f
    }()

    private static let percentFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .percent
        f.locale = locale
        f.maximumFractionDigits = 0
        return f
    }()

    private static let dayMonthFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = locale
        f.setLocalizedDateFormatFromTemplate("d MMM")
        return f
    }()

    private static let longDateFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = locale
        f.dateStyle = .long
        return f
    }()

    private static let monthYearFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = locale
        f.setLocalizedDateFormatFromTemplate("MMMM yyyy")
        return f
    }()

    private static let symbolsFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = locale
        return f
    }()

    // MARK: Montants

    /// « 1 234,56 € »
    static func money(_ value: Double) -> String {
        currencyFormatter.string(from: NSNumber(value: value)) ?? String(format: "%.2f €", value)
    }

    /// « 1 235 € » — axes de graphiques et libellés serrés.
    static func moneyShort(_ value: Double) -> String {
        compactCurrencyFormatter.string(from: NSNumber(value: value)) ?? "\(Int(value.rounded())) €"
    }

    /// Montant signé, pour les écarts : « +12,00 € » / « −12,00 € ».
    static func signedMoney(_ value: Double) -> String {
        let sign = value > 0 ? "+" : (value < 0 ? "−" : "")
        return sign + money(abs(value))
    }

    /// `0.42` → « 42 % »
    static func ratio(_ value: Double) -> String {
        percentFormatter.string(from: NSNumber(value: value)) ?? "\(Int((value * 100).rounded())) %"
    }

    /// Masque affiché quand le mode confidentiel est actif.
    static let masked = "•••••• €"

    // MARK: Dates

    /// « 12 janv. »
    static func dayMonth(_ date: Date) -> String { dayMonthFormatter.string(from: date) }

    /// « 12 janvier 2026 »
    static func longDate(_ date: Date) -> String { longDateFormatter.string(from: date) }

    /// « janvier 2026 »
    static func monthYear(_ date: Date) -> String { monthYearFormatter.string(from: date) }

    /// Nom du mois seul, capitalisé : « Janvier ».
    static func monthName(_ month: Int) -> String {
        let names = symbolsFormatter.standaloneMonthSymbols ?? []
        guard month >= 1, month <= names.count else { return "" }
        return names[month - 1].capitalized(with: locale)
    }

    /// Abréviation courte pour les axes : « Janv. », « Févr. »…
    static func monthAbbrev(_ month: Int) -> String {
        let names = symbolsFormatter.shortStandaloneMonthSymbols ?? []
        guard month >= 1, month <= names.count else { return "" }
        return names[month - 1].capitalized(with: locale)
    }
}
