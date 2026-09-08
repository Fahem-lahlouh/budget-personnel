import Foundation

/// Export des données vers un fichier CSV partageable.
///
/// Le format est pensé pour être ré-ouvrable dans Excel/Numbers en français :
/// séparateur `;`, décimale `,`, BOM UTF-8 en tête pour que les accents ne
/// soient pas mal interprétés par Excel sur Windows.
enum ExportService {

    /// Colonnes, dans l'ordre du tableau mensuel du classeur d'origine.
    private static let headers = [
        "Année", "Mois", "Date", "Catégorie", "Enseigne", "Description",
        "Montant", "Type", "Montant prévu", "Écart", "Statut", "Remarque", "Confidentiel"
    ]

    /// Génère le CSV des dépenses.
    ///
    /// - Parameter includeConfidential: quand `false`, les dépenses marquées
    ///   confidentielles sont exclues du fichier — pratique pour partager un
    ///   export sans tout dévoiler.
    static func makeCSV(
        expenses: [Expense],
        settings: AppSettings,
        includeConfidential: Bool
    ) -> String {

        let rows = expenses
            .filter { includeConfidential || !$0.isConfidential }
            .sorted { $0.date == $1.date ? $0.createdAt < $1.createdAt : $0.date < $1.date }

        var lines: [String] = [headers.joined(separator: ";")]

        for expense in rows {
            let variance = expense.variance
            let fields: [String] = [
                String(expense.year),
                Fmt.monthName(expense.month),
                isoDay(expense.date),
                expense.categoryName,
                expense.merchantName,
                expense.details,
                decimal(expense.amount),
                settings.label(for: expense.type),
                expense.plannedAmount.map(decimal) ?? "",
                variance.map(decimal) ?? "",
                settings.label(for: expense.status),
                expense.note,
                expense.isConfidential ? "Oui" : "Non"
            ]
            lines.append(fields.map(escape).joined(separator: ";"))
        }

        return lines.joined(separator: "\r\n")
    }

    /// Écrit le CSV dans un fichier temporaire et renvoie son URL, prête pour
    /// une feuille de partage.
    static func writeCSV(
        expenses: [Expense],
        settings: AppSettings,
        includeConfidential: Bool
    ) throws -> URL {

        let csv = makeCSV(expenses: expenses, settings: settings, includeConfidential: includeConfidential)

        let stamp = DateFormatter()
        stamp.locale = Locale(identifier: "en_US_POSIX")
        stamp.dateFormat = "yyyy-MM-dd"
        let name = "budget-personnel-\(stamp.string(from: Date())).csv"

        let url = FileManager.default.temporaryDirectory.appendingPathComponent(name)

        // BOM UTF-8 : sans lui, Excel affiche « Ã© » à la place de « é ».
        var data = Data([0xEF, 0xBB, 0xBF])
        data.append(Data(csv.utf8))
        try data.write(to: url, options: .atomic)

        return url
    }

    // MARK: - Encodage

    private static func decimal(_ value: Double) -> String {
        String(format: "%.2f", value).replacingOccurrences(of: ".", with: ",")
    }

    private static func isoDay(_ date: Date) -> String {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }

    /// Échappement CSV : guillemets doublés, champ encadré dès qu'il contient un
    /// séparateur, un guillemet ou un saut de ligne.
    private static func escape(_ field: String) -> String {
        guard field.contains(";") || field.contains("\"") || field.contains("\n") || field.contains("\r") else {
            return field
        }
        return "\"" + field.replacingOccurrences(of: "\"", with: "\"\"") + "\""
    }
}
