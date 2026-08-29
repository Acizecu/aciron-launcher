# Build the installer sidebar bitmap from any picture.
#
# NSIS draws this on the welcome and finish pages of the standard wizard, and it
# wants a BMP of exactly 164x314 - the classic MUI size. Anything larger is
# clipped, not scaled, so resizing has to happen here.
#
# The picture is fitted by "cover": scaled until it fills the frame, then
# centre-cropped. Letterboxing would leave bars in the wizard's own grey, which
# looks like a mistake rather than a choice.
#
# Alpha is flattened onto the frame first: NSIS statics do not blend it, and a
# transparent PNG comes out with black corners.
#
# ASCII-only strings on purpose: Windows PowerShell 5.1 reads .ps1 as ANSI.
#
#   powershell -File make-sidebar.ps1 -Src "C:\path\to\picture.png"
param(
  [Parameter(Mandatory = $true)][string]$Src,
  [string]$Out = "$PSScriptRoot\sidebar.bmp",
  [int]$W = 164,
  [int]$H = 314,
  [string]$Bg = "131315"
)
Add-Type -AssemblyName System.Drawing

if (-not (Test-Path $Src)) { Write-Output "no source: $Src"; exit 1 }
# A typed [string] parameter coerces anything assigned back to it, so the loaded
# image needs its own name.
$img = [System.Drawing.Image]::FromFile($Src)

$bmp = New-Object System.Drawing.Bitmap($W, $H, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#$Bg"))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality

# Cover fit: scale by the larger ratio, then centre the overflow off-frame.
$scale = [math]::Max($W / $img.Width, $H / $img.Height)
$dw = [int][math]::Ceiling($img.Width * $scale)
$dh = [int][math]::Ceiling($img.Height * $scale)
$dx = [int](($W - $dw) / 2)
$dy = [int](($H - $dh) / 2)
$g.DrawImage($img, $dx, $dy, $dw, $dh)
$g.Dispose()

$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Bmp)
$bmp.Dispose(); $img.Dispose()

$len = (Get-Item $Out).Length
Write-Output ("saved $Out  ${W}x${H}  " + [math]::Round($len / 1KB) + " KB  (source ${dw}x${dh} placed at $dx,$dy)")
