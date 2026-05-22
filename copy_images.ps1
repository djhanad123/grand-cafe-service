$brainDir = "C:\Users\Hanad\.gemini\antigravity\brain\e4bc82e0-079e-4790-befb-6a1c534672ca"
$destDir = "c:\Users\Hanad\Documents\First-AI-app\assets\images"

if (!(Test-Path $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir
}

$files = Get-ChildItem -Path $brainDir -Filter "*_sketch_*.png"
foreach ($file in $files) {
    $origName = $file.Name
    $targetName = ""
    
    if ($origName -like "*menu_header*") {
        $targetName = "menu_header_sketch.png"
    } elseif ($origName -like "*hot_coffee*") {
        $targetName = "hot_coffee_sketch.png"
    } elseif ($origName -like "*iced_coffee*") {
        $targetName = "iced_coffee_sketch.png"
    } elseif ($origName -like "*matcha*") {
        $targetName = "matcha_sketch.png"
    } elseif ($origName -like "*iced_tea*") {
        $targetName = "iced_tea_sketch.png"
    } elseif ($origName -like "*milkshake*") {
        $targetName = "milkshake_sketch.png"
    } elseif ($origName -like "*mojito*") {
        $targetName = "mojito_sketch.png"
    } elseif ($origName -like "*lemonade*") {
        $targetName = "lemonade_sketch.png"
    } elseif ($origName -like "*hot_chocolate*") {
        $targetName = "hot_chocolate_sketch.png"
    }
    
    if ($targetName -ne "") {
        Copy-Item -Path $file.FullName -Destination (Join-Path $destDir $targetName) -Force
        Write-Host "Copied $origName to $targetName"
    }
}
