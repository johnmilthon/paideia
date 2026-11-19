# Paideia Escritorio · by JohnM
# Abre Paideia como aplicación de Windows con IA local (llama.cpp). Nada sale de tu equipo,
# salvo la descarga inicial del modelo desde Hugging Face.
param([ValidateSet('abrir','modelo','probar','vigilar')][string]$Accion = 'abrir', [int]$Motor_Id = 0)
$ErrorActionPreference = 'Stop'
$Raiz    = Split-Path -Parent $PSScriptRoot
$Motor   = Join-Path $Raiz 'motor'
$App     = Join-Path $Raiz 'app'
$Modelos = Join-Path $Raiz 'modelos'
$Logs    = Join-Path $Raiz 'registros'
$Config  = Join-Path $Raiz 'config.json'
$Puerto  = 8765
$Url     = "http://127.0.0.1:$Puerto/"
New-Item -ItemType Directory -Force -Path $Modelos, $Logs | Out-Null

$Catalogo = [ordered]@{
  'preciso' = @{ Nombre = 'Qwen3 4B Instruct 2507 (más preciso)'; Archivo = 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf'; Tam = '2,5 GB';
                 Url = 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf' }
  'rapido'  = @{ Nombre = 'Qwen3 1.7B (más rápido)'; Archivo = 'Qwen3-1.7B-Q4_K_M.gguf'; Tam = '1,1 GB';
                 Url = 'https://huggingface.co/unsloth/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf' }
}

function Leer-Config { if (Test-Path $Config) { try { return Get-Content $Config -Raw | ConvertFrom-Json } catch {} } return [pscustomobject]@{ modelo = ''; gpu = $true } }
function Guardar-Config($c) { $c | ConvertTo-Json | Set-Content -Encoding UTF8 $Config }

function Elegir-Modelo {
  Write-Host ''
  Write-Host '  PAIDEIA ESCRITORIO · Elige el modelo de IA' -ForegroundColor Green
  Write-Host '  (los dos son gratuitos, licencia Apache 2.0)'
  Write-Host ''
  Write-Host '  1) Qwen3 4B Instruct 2507 · 2,5 GB · más preciso (recomendado con 16 GB de RAM o más)'
  Write-Host '  2) Qwen3 1.7B · 1,1 GB · unas 3 veces más rápido, pero se equivoca más'
  Write-Host ''
  $r = Read-Host '  Escribe 1 o 2 y pulsa Enter'
  if ($r -eq '2') { return 'rapido' } else { return 'preciso' }
}

function Descargar-Modelo($clave) {
  $m = $Catalogo[$clave]; $destino = Join-Path $Modelos $m.Archivo
  if (Test-Path $destino) { return $destino }
  Write-Host ''
  Write-Host "  Descargando $($m.Nombre) ($($m.Tam)) desde Hugging Face..." -ForegroundColor Yellow
  Write-Host '  Solo se descarga una vez. Si se corta, vuelve a abrir Paideia y continuará donde quedó.'
  Write-Host '  Tus documentos y preguntas NO se envían a ningún sitio.'
  Write-Host ''
  $parcial = "$destino.part"
  & curl.exe -L --fail --retry 5 -C - -o $parcial $m.Url
  if ($LASTEXITCODE -ne 0) { throw "No se pudo descargar el modelo (código $LASTEXITCODE). Revisa tu conexión e inténtalo de nuevo." }
  Move-Item -Force $parcial $destino
  return $destino
}

function Ruta-Modelo([switch]$Preguntar) {
  $c = Leer-Config
  if ($Preguntar -or -not $c.modelo -or -not $Catalogo.Contains($c.modelo)) { $c.modelo = Elegir-Modelo; Guardar-Config $c }
  return (Descargar-Modelo $c.modelo)
}

function Motor-Activo { try { (Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "$($Url)health").StatusCode -eq 200 } catch { $false } }
function App-Servida { try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "$($Url)lectura.js"; $r.StatusCode -eq 200 } catch { $false } }
function Modelo-Activo { try { $j = Invoke-RestMethod -TimeoutSec 3 "$($Url)v1/models"; return [string]$j.data[0].id } catch { return '' } }
function Detener-Motor { Get-Process llama-server -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Motor*" } | Stop-Process -Force; Start-Sleep 1 }

function Iniciar-Motor($modelo, $gpu) {
  $ngl = if ($gpu) { '99' } else { '0' }
  $hilos = [Math]::Max(2, [int]((Get-CimInstance Win32_Processor | Measure-Object -Sum NumberOfCores).Sum))
  $cfg = Leer-Config; if ($cfg.hilos) { $hilos = [int]$cfg.hilos }
  $args = @('-m', "`"$modelo`"", '--host', '127.0.0.1', '--port', "$Puerto", '--path', "`"$App`"",
            '-c', '4096', '--reasoning', 'off', '-ngl', $ngl, '-t', "$hilos", '--cache-reuse', '256')
  $p = Start-Process -FilePath (Join-Path $Motor 'llama-server.exe') -ArgumentList $args -WindowStyle Hidden -PassThru `
        -RedirectStandardError (Join-Path $Logs 'motor.log') -RedirectStandardOutput (Join-Path $Logs 'motor-salida.log')
  for ($i = 0; $i -lt 240; $i++) {
    if (Motor-Activo) { if (App-Servida) { return $p } else { Stop-Process -Id $p.Id -Force; return $null } }
    if ($p.HasExited) { return $null }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

function Abrir-Ventana {
  $perfil = Join-Path $env:LOCALAPPDATA 'PaideiaEscritorio\perfil'
  $navs = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
            "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
            "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
  $nav = $navs | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($nav) {
    return Start-Process -FilePath $nav -ArgumentList @("--app=$Url", "--user-data-dir=`"$perfil`"", '--no-first-run', '--no-default-browser-check', '--window-size=1280,860') -PassThru
  }
  Start-Process $Url; return $null
}

function Probar-Velocidad {
  $modelo = Ruta-Modelo
  $bench = Join-Path $Motor 'llama-bench.exe'
  Write-Host ''
  Write-Host '  Midiendo velocidad (unos 1-3 minutos)...' -ForegroundColor Yellow
  $res = @{}
  $pcores = [Math]::Max(2, [int]((Get-CimInstance Win32_Processor | Measure-Object -Sum NumberOfCores).Sum))
  $variantes = @(@{ k = 'cpu'; ngl = 0; t = $pcores; et = "procesador ($pcores hilos)" }, @{ k = 'cpu8'; ngl = 0; t = [Math]::Min(8, $pcores); et = 'procesador (8 hilos)' }, @{ k = 'gpu'; ngl = 99; t = $pcores; et = 'graficos integrados (Vulkan)' })
  foreach ($v in $variantes) {
    $ngl = $v.ngl; $etiqueta = $v.et
    Write-Host "  - Probando con $etiqueta"
    # Se ejecuta con cmd para que los mensajes informativos de llama.cpp no se traten como errores.
    $out = cmd /c "call `"$bench`" -m `"$modelo`" -p 512 -n 64 -ngl $ngl -t $($v.t) -r 2 -o csv 2>nul"
    $out | Set-Content -Encoding UTF8 (Join-Path $Logs "bench-$($v.k)-$(Split-Path -Leaf $modelo).csv")
    if ($LASTEXITCODE -ne 0 -or -not $out) { Write-Host '    no disponible' -ForegroundColor DarkYellow; continue }
    $filas = $out | ConvertFrom-Csv
    $pp = ($filas | Where-Object { [int]$_.n_prompt -gt 0 } | Select-Object -First 1).avg_ts
    $tg = ($filas | Where-Object { [int]$_.n_gen -gt 0 } | Select-Object -First 1).avg_ts
    $res[$v.k] = @{ pp = [double]$pp; tg = [double]$tg; t = $v.t; ngl = $ngl }
    # Respuesta típica: ~1.300 tokens de fragmentos y ~150 de respuesta
    $seg = [Math]::Round(1300 / [double]$pp + 150 / [double]$tg, 1)
    Write-Host ("    lectura {0:N0} tokens/s · escritura {1:N1} tokens/s · respuesta típica ≈ {2} s" -f [double]$pp, [double]$tg, $seg) -ForegroundColor Green
    $res[$v.k].seg = $seg
  }
  if ($res.Count -gt 0) {
    $mejor = ($res.GetEnumerator() | Sort-Object { $_.Value.seg } | Select-Object -First 1).Key
    $c = Leer-Config; $c.gpu = ($mejor -eq 'gpu'); $c | Add-Member -Force hilos $res[$mejor].t; Guardar-Config $c
    $txt = if ($c.gpu) { 'gráficos integrados' } else { 'procesador' }
    Write-Host ''
    Write-Host "  Paideia usará: $txt" -ForegroundColor Green
    ($res | ConvertTo-Json -Depth 3) | Set-Content -Encoding UTF8 (Join-Path $Logs "velocidad-$(Split-Path -Leaf $modelo).json")
  }
  Write-Host ''
  Read-Host '  Pulsa Enter para cerrar'
}

try {
  if ($Accion -eq 'probar') { Probar-Velocidad; exit }
  if ($Accion -eq 'vigilar') {
    $perfil = Join-Path $env:LOCALAPPDATA 'PaideiaEscritorio\perfil'
    Start-Sleep 15
    while (Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" | Where-Object { $_.CommandLine -like "*$perfil*" }) { Start-Sleep 5 }
    if ($Motor_Id) { Stop-Process -Id $Motor_Id -Force -ErrorAction SilentlyContinue }
    exit
  }
  if ($Accion -eq 'modelo') {
    $modelo = Ruta-Modelo -Preguntar
    Get-Process llama-server -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "$Motor*" } | Stop-Process -Force
    Write-Host '  Modelo listo. Abre Paideia de nuevo.' -ForegroundColor Green; Start-Sleep 3; exit
  }
  if (Motor-Activo) {
    $cfg = Leer-Config; $quiere = if ($cfg.modelo -and $Catalogo.Contains($cfg.modelo)) { $Catalogo[$cfg.modelo].Archivo } else { '' }
    if ((App-Servida) -and (-not $quiere -or (Modelo-Activo) -like "*$([IO.Path]::GetFileNameWithoutExtension($quiere))*")) { Abrir-Ventana | Out-Null; exit } else { Detener-Motor }
  }
  $modelo = Ruta-Modelo
  $c = Leer-Config
  Write-Host '  Iniciando Paideia y cargando la IA...' -ForegroundColor Green
  $srv = Iniciar-Motor $modelo ([bool]$c.gpu)
  if (-not $srv -and $c.gpu) {
    Write-Host '  Los gráficos integrados no funcionaron; se usará el procesador.' -ForegroundColor DarkYellow
    $c.gpu = $false; Guardar-Config $c
    $srv = Iniciar-Motor $modelo $false
  }
  if (-not $srv) { throw "No se pudo iniciar el motor de IA. Revisa el archivo registros\motor.log." }
  Abrir-Ventana | Out-Null
  # Un proceso oculto detiene el motor cuando se cierra la ventana de Paideia; esta consola se cierra.
  Start-Process powershell -WindowStyle Hidden -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"", '-Accion', 'vigilar', '-Motor_Id', "$($srv.Id)")
} catch {
  Write-Host ''
  Write-Host ("  ERROR: " + $_.Exception.Message) -ForegroundColor Red
  Read-Host '  Pulsa Enter para cerrar'
}
