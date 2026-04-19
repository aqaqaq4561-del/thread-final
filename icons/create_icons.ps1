[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Drawing

function Create-Icon {
    param([int]$size, [string]$path)
    
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'HighQuality'
    
    $purpleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(99, 102, 241))
    $g.FillRectangle($purpleBrush, 0, 0, $size, $size)
    
    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $s = $size / 128.0
    
    $g.FillRectangle($whiteBrush, [int](34*$s), [int](59*$s), [Math]::Max(1,[int](10*$s)), [int](30*$s))
    $g.FillRectangle($whiteBrush, [int](50*$s), [int](44*$s), [Math]::Max(1,[int](10*$s)), [int](45*$s))
    $g.FillRectangle($whiteBrush, [int](66*$s), [int](52*$s), [Math]::Max(1,[int](10*$s)), [int](37*$s))
    $g.FillRectangle($whiteBrush, [int](82*$s), [int](36*$s), [Math]::Max(1,[int](10*$s)), [int](53*$s))
    
    $purpleBrush.Dispose()
    $whiteBrush.Dispose()
    $g.Dispose()
    
    $ms = New-Object System.IO.MemoryStream
    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    [System.IO.File]::WriteAllBytes($path, $ms.ToArray())
    $ms.Dispose()
    $bmp.Dispose()
    Write-Host "Created: $path ($size x $size)"
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Create-Icon -size 16 -path (Join-Path $scriptDir "icon16.png")
Create-Icon -size 48 -path (Join-Path $scriptDir "icon48.png")
Create-Icon -size 128 -path (Join-Path $scriptDir "icon128.png")
Write-Host "All icons created!"
