$content = Get-Content 'function/index.js' -Raw

# Find the end of the PMH list manager (first occurrence of HISTORY OF RECURRENT SINUSITIS followed by ]);
$searchStr = "'HISTORY OF RECURRENT SINUSITIS'"
$idx1 = $content.IndexOf($searchStr)
$idxClose1 = $content.IndexOf("]);", $idx1 + $searchStr.Length)

# Find the second occurrence (inside the orphaned block)
$idx2 = $content.IndexOf($searchStr, $idx1 + 1)
$idxClose2 = $content.IndexOf("]);", $idx2 + $searchStr.Length)

Write-Output "First marker at: $idx1"
Write-Output "First close at: $idxClose1"
Write-Output "Second marker at: $idx2"
Write-Output "Second close at: $idxClose2"

if ($idx1 -gt 0 -and $idxClose1 -gt 0 -and $idx2 -gt 0 -and $idxClose2 -gt $idxClose1) {
    # Keep everything before the first close + 3 chars (]);)
    # Remove everything up to and including the second close + 3 chars
    $newContent = $content.Substring(0, $idxClose1 + 3) + $content.Substring($idxClose2 + 3)
    Set-Content 'function/index.js' -Value $newContent -Encoding UTF8
    Write-Output "FIXED! Removed orphaned block."
} else {
    Write-Output "Could not find the pattern. IDs may be invalid."
}