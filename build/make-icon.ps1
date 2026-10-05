# Draws the placeholder app icon (build/icon.png, 1024x1024): an orange viewfinder on the app's
# dark grey with "ST". electron-builder turns it into the Windows .ico. To use a real logo,
# replace build/icon.png with a square PNG (1024x1024 is best) and run `npm run dist`.
#   powershell -ExecutionPolicy Bypass -File build\make-icon.ps1

Add-Type -AssemblyName System.Drawing
$out = Join-Path $PSScriptRoot 'icon.png'
$size = 1024
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::Transparent)

# Rounded dark square
$r = 200; $m = 40; $w = $size - 2 * $m
$path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc($m, $m, $r, $r, 180, 90)
$path.AddArc(($m + $w - $r), $m, $r, $r, 270, 90)
$path.AddArc(($m + $w - $r), ($m + $w - $r), $r, $r, 0, 90)
$path.AddArc($m, ($m + $w - $r), $r, $r, 90, 90)
$path.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 35, 36, 40))), $path)

# Viewfinder corner brackets
$pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 242, 163, 58)), 44
$pen.StartCap = 'Square'; $pen.EndCap = 'Square'
$fx = 190; $fw = 644; $fh = 420; $fy = (1024 - $fh) / 2; $len = 120
$corners = @(
  @($fx, $fy, 1, 1),
  @(($fx + $fw), $fy, -1, 1),
  @($fx, ($fy + $fh), 1, -1),
  @(($fx + $fw), ($fy + $fh), -1, -1)
)
foreach ($c in $corners) {
  $x = $c[0]; $y = $c[1]
  $g.DrawLine($pen, $x, $y, ($x + $c[2] * $len), $y)
  $g.DrawLine($pen, $x, $y, $x, ($y + $c[3] * $len))
}

# "ST"
$font = New-Object System.Drawing.Font 'Segoe UI', 230, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
$g.DrawString('ST', $font, (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 214, 215, 218))), (New-Object System.Drawing.RectangleF 0, 10, 1024, 1024), $fmt)

$bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "Wrote $out"
