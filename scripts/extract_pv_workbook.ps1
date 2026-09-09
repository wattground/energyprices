param([Parameter(Mandatory = $true)][string]$WorkbookPath)
# Read-only extraction of saved Excel values; does not recalculate or edit Excel.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
$stream = [System.IO.File]::Open($WorkbookPath, 'Open', 'Read', 'ReadWrite')
try {
    $archive = [System.IO.Compression.ZipArchive]::new($stream)
    function Read-WorkbookXml([string]$EntryName) {
        $entry = $archive.GetEntry($EntryName)
        if ($null -eq $entry) { throw "Missing XLSX entry: $EntryName" }
        $reader = [System.IO.StreamReader]::new($entry.Open())
        try { [xml]$reader.ReadToEnd() } finally { $reader.Dispose() }
    }
    try {
        $book = Read-WorkbookXml 'xl/workbook.xml'
        $relationships = Read-WorkbookXml 'xl/_rels/workbook.xml.rels'
        $selected = @('BE', 'DE', 'DK1', 'DK2', 'FR', 'HU', 'NL', 'PL', 'SE3', 'SE4', 'GR', 'IT-PUN')
        $result = [ordered]@{}
        foreach ($sheet in $book.workbook.sheets.sheet) {
            if ($sheet.name -notin $selected) { continue }
            $id = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
            $target = ($relationships.Relationships.Relationship | Where-Object { $_.Id -eq $id }).Target
            $entryName = if ($target.StartsWith('/')) { $target.TrimStart('/') } else { 'xl/' + $target }
            $xml = Read-WorkbookXml $entryName
            $cells = @{}
            foreach ($row in $xml.worksheet.sheetData.row) {
                foreach ($cell in $row.c) { $cells[$cell.r] = $cell }
            }
            function Read-Number([string]$Address) {
                $cell = $cells[$Address]
                if ($null -eq $cell -or $cell.t -in @('e', 's', 'inlineStr') -or [string]::IsNullOrWhiteSpace($cell.v)) {
                    throw "Missing/non-numeric value: $($sheet.name)!$Address"
                }
                $number = [double]::Parse($cell.v, [System.Globalization.CultureInfo]::InvariantCulture)
                if ([double]::IsNaN($number) -or [double]::IsInfinity($number) -or $number -lt 0) {
                    throw "Invalid value: $($sheet.name)!$Address"
                }
                return $number
            }
            for ($hour = 1; $hour -le 24; $hour++) {
                if ((Read-Number ('A' + ($hour + 1))) -ne $hour) { throw "Unexpected hour order in $($sheet.name)" }
            }
            $months = [ordered]@{}
            $sums = [ordered]@{}
            $days = [ordered]@{}
            $shares = [ordered]@{}
            for ($month = 1; $month -le 12; $month++) {
                $column = [string][char](65 + $month)
                if ((Read-Number ($column + '1')) -ne $month) { throw "Unexpected month header" }
                $key = '{0:00}' -f $month
                $months[$key] = @(for ($hour = 1; $hour -le 24; $hour++) { Read-Number ($column + ($hour + 1)) })
                $sums[$key] = Read-Number ($column + '26')
                $days[$key] = Read-Number ($column + '27')
                $shares[$key] = Read-Number ($column + '28')
            }
            $result[$sheet.name] = [ordered]@{ months = $months; cachedDailySums = $sums; days = $days; cachedMonthlyShares = $shares }
        }
        if ($result.Count -ne $selected.Count) { throw 'Some required PV sheets are missing' }
        $result | ConvertTo-Json -Depth 8 -Compress
    } finally { $archive.Dispose() }
} finally { $stream.Dispose() }
