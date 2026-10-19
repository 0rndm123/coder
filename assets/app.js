(() => {
      'use strict';
      // Manter a chave histórica para não perder leituras já efetuadas neste browser.
      const KEY = 'leitor_codigos_mvp_v1';
      const byId = id => document.getElementById(id);
      const status = byId('status');
      const total = byId('total');
      const rows = byId('rows');
      const exportButton = byId('export');
      const clearButton = byId('clear');
      const scannerInput = byId('scanner-value');
      const scannerState = byId('scanner-state');
      const scannerArm = byId('scanner-arm');
      const movementIn = byId('movement-in');
      const movementOut = byId('movement-out');
      const otherMovement = byId('other-movement');
      const capturePanel = byId('capture-panel');
      const captureInfo = byId('capture-info');
      const captureCancel = byId('capture-cancel');
      const capturePhoto = byId('capture-photo');
      const captureTakePhoto = byId('capture-take-photo');
      const captureFile = byId('capture-file');
      const captureCameraFile = byId('capture-camera-file');
      const captureDiagnostics = byId('capture-diagnostics');
      const cameraSelect = byId('camera-select');
      const cameraTools = byId('camera-tools');
      const zoomControl = byId('zoom-control');
      const zoomRange = byId('zoom-range');
      const zoomValue = byId('zoom-value');
      const torchToggle = byId('torch-toggle');
      const lastScan = byId('last-scan');
      const recentScans = byId('recent-scans');
      const readConfirmation = byId('read-confirmation');
      let readConfirmationTimer;
      byId('read-confirmation-dismiss').addEventListener('click', () => { clearTimeout(readConfirmationTimer); readConfirmation.hidden = true; });
      let records = [];
      let storageAvailable = true;
      let captureMode = null;
      let decoder = null;
      let cameraRunning = false;
      let captureBusy = false;
      let captureDone = false;
      let generation = 0;
      let cameras = [];
      let nativeDetector = null;
      let nativeTimer = null;
      let currentVideo = null;
      let activeTrack = null;
      let cameraCapabilities = null;
      let torchEnabled = false;
      let zoomRequest = 0;
      let scanStartedAt = 0;

      function message(text, variant='') {
        status.textContent = text;
        status.className = variant;
      }
      function showMode(mode) {
        captureMode = mode;
        movementIn.setAttribute('aria-pressed', String(mode === 'entrada'));
        movementOut.setAttribute('aria-pressed', String(mode === 'saida'));
        captureInfo.textContent = (mode === 'entrada' ? 'ENTRADA' : 'SAÍDA') + ': aponte a câmara ao código.';
      }
      function newId() {
        if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID();
        return 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      }
      function isRecord(r) { return ScanDomain.isRecord(r); }
      function save(next) {
        try {
          localStorage.setItem(KEY, JSON.stringify(next));
          records = next;
          storageAvailable = true;
          render();
          return true;
        } catch (error) {
          storageAvailable = false;
          message('Não foi possível guardar os dados. Verifique o armazenamento do browser.', 'error');
          return false;
        }
      }
      function displayTimestamp(iso) {
        return new Intl.DateTimeFormat('pt-PT', {dateStyle:'short',timeStyle:'medium'}).format(new Date(iso));
      }
      function render() {
        total.textContent = records.length.toLocaleString('pt-PT');
        exportButton.disabled = records.length === 0;
        clearButton.disabled = records.length === 0;
        rows.replaceChildren();
        recentScans.replaceChildren();
        for(const r of ScanDomain.recentRecords(records, 10)){
          const li=document.createElement('li');
          const head=document.createElement('strong');
          head.textContent=(r.movement==='entrada'?'Entrada':r.movement==='saida'?'Saída':'Sem movimento')+' · '+displayTimestamp(r.scanned_at)+' · '+r.format;
          const value=document.createElement('div');
          value.textContent=r.value;
          li.append(head,value);
          recentScans.appendChild(li);
        }
        if(!records.length){const li=document.createElement('li');li.textContent='Sem leituras.';recentScans.appendChild(li);}
        if (!records.length) {
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = 6;
          td.className = 'muted';
          td.textContent = 'Ainda não existem leituras.';
          tr.appendChild(td);
          rows.appendChild(tr);
          return;
        }
        for (const r of records.slice(-80).reverse()) {
          const tr = document.createElement('tr');
          const date = document.createElement('td');
          date.textContent = displayTimestamp(r.scanned_at);
          const movementCell = document.createElement('td');
          movementCell.textContent = r.movement === 'entrada' ? 'Entrada' : r.movement === 'saida' ? 'Saída' : '—';
          movementCell.className = 'movement-cell ' + (r.movement === 'entrada' ? 'in' : r.movement === 'saida' ? 'out' : 'unknown');
          const origin = document.createElement('td');
          const names = {camera:'Câmara',scanner_hid:'Pistola',manual:'Manual',importado:'Importado'};
          origin.textContent = names[r.source] || r.source;
          const format = document.createElement('td');
          format.textContent = r.format === 'DESCONHECIDO' ? '—' : r.format;
          const val = document.createElement('td');
          val.className = 'value';
          val.textContent = r.value;
          const actions = document.createElement('td');
          const del = document.createElement('button');
          del.className = 'outline';
          del.type = 'button';
          del.textContent = 'Remover';
          del.title = 'Remover apenas esta leitura';
          del.addEventListener('click', () => {
            if (save(records.filter(x => x.id !== r.id))) message('Leitura removida.', 'success');
          });
          actions.appendChild(del);
          tr.append(date, movementCell, origin, format, val, actions);
          rows.appendChild(tr);
        }
      }
      function add(value, format, source, mode) {
        if (!['entrada','saida'].includes(mode)) {
          message('Escolha ENTRADA ou SAÍDA antes de registar o código.', 'warn');
          return false;
        }
        if (typeof value !== 'string' || !value.length || value.length > ScanDomain.MAX_VALUE_LENGTH) {
          message('O código está vazio ou excede o limite permitido.', 'warn');
          return false;
        }
        const r = {id:newId(),scanned_at:new Date().toISOString(),format,value,source,movement:mode};
        if (!isRecord(r)) { message('Registo inválido. Confirme o código e volte a tentar.', 'warn'); return false; }
        if (!save([...records, r])) return false;
        byId('read-confirmation-title').textContent=(mode==='entrada'?'ENTRADA':'SAÍDA')+' registada · '+format;
        byId('read-confirmation-value').textContent=value;
        readConfirmation.hidden=false;
        clearTimeout(readConfirmationTimer);
        readConfirmationTimer=setTimeout(()=>{readConfirmation.hidden=true;},7000);
        const name = mode === 'entrada' ? 'ENTRADA' : 'SAÍDA';
        message(name + ' registada: ' + value.slice(0,100) + (value.length > 100 ? '…' : ''), 'success');
        lastScan.textContent = name + ' registada com sucesso: ' + value.slice(0,80) + (value.length > 80 ? '…' : '');
        if (source === 'camera' && navigator.vibrate) navigator.vibrate(100);
        return true;
      }
      function requireOtherMode() {
        if (!otherMovement.value) {
          message('Escolha o tipo de movimento para pistola ou registo manual.', 'warn');
          otherMovement.focus();
          return null;
        }
        return otherMovement.value;
      }
      function cameraError(error) {
        const m = String(error && (error.message || error) || '');
        if (!window.isSecureContext) return 'A câmara exige HTTPS. Utilize o endereço seguro do Cloudflare Tunnel.';
        if (/NotAllowed|Permission|denied/i.test(m)) return 'Acesso à câmara recusado. Autorize a câmara nas permissões do browser.';
        if (/NotFound|DevicesNotFound/i.test(m)) return 'Nenhuma câmara disponível. Verifique o dispositivo ou escolha outra câmara.';
        if (/NotReadable|TrackStart|in use/i.test(m)) return 'A câmara está ocupada por outra aplicação. Feche-a e volte a tentar.';
        return 'Não foi possível iniciar a câmara. Tente escolher outra câmara ou utilizar uma fotografia.';
      }
      async function stopDecoder() {
        if (nativeTimer) clearTimeout(nativeTimer);
        nativeTimer = null;
        nativeDetector = null;
        currentVideo = null;
        activeTrack = null;
        cameraCapabilities = null;
        torchEnabled = false;
        zoomRequest++;
        cameraTools.hidden = true;
        zoomControl.hidden = true;
        torchToggle.hidden = true;
        torchToggle.setAttribute('aria-pressed','false');
        torchToggle.textContent = 'Acender luz';
        const current = decoder;
        decoder = null;
        const wasRunning = cameraRunning;
        cameraRunning = false;
        if (!current) return;
        if (wasRunning) {
          try { await current.stop(); }
          catch (error) { console.warn('Falha ao parar a câmara:', error); }
        }
        try { current.clear(); }
        catch (error) { console.warn('Falha ao limpar o leitor:', error); }
      }
      async function closeCapture() {
        generation++;
        captureBusy = true;
        await stopDecoder();
        captureBusy = false;
        captureMode = null;
        capturePanel.hidden = true;
        document.body.classList.remove('scanning');
        movementIn.setAttribute('aria-pressed','false');
        movementOut.setAttribute('aria-pressed','false');
      }
      // Aumentar a imagem captada na própria câmara (não apenas no CSS) ajuda
      // quando o código ocupa poucos píxeis. As opções dependem do hardware.
      function zoomLabel(value) {
        return Number(value).toFixed(1).replace('.', ',') + '×';
      }
      async function applyZoom() {
        const track = activeTrack;
        const capabilities = cameraCapabilities;
        if (!track || !capabilities || !capabilities.zoom) return;
        const request = ++zoomRequest;
        const value = Number(zoomRange.value);
        zoomValue.textContent = zoomLabel(value);
        try {
          await track.applyConstraints({advanced:[{zoom:value}]});
          if (activeTrack !== track || request !== zoomRequest) return;
          const actual = track.getSettings?.().zoom;
          if (typeof actual === 'number') zoomValue.textContent = zoomLabel(actual);
        } catch (error) {
          if (activeTrack === track && request === zoomRequest) {
            captureDiagnostics.textContent = 'O telemóvel não permitiu alterar o zoom nesta câmara.';
          }
        }
      }
      async function toggleTorch() {
        const track = activeTrack;
        if (!track || !cameraCapabilities?.torch) return;
        const next = !torchEnabled;
        try {
          await track.applyConstraints({advanced:[{torch:next}]});
          if (activeTrack !== track) return;
          torchEnabled = next;
          torchToggle.setAttribute('aria-pressed', String(next));
          torchToggle.textContent = next ? 'Apagar luz' : 'Acender luz';
        } catch (error) {
          captureDiagnostics.textContent = 'Esta câmara não permite controlar a luz pelo browser.';
        }
      }
      async function configureCameraControls(token) {
        const video = byId('reader').querySelector('video');
        const track = video?.srcObject?.getVideoTracks?.()[0];
        if (!track || generation !== token) return;
        activeTrack = track;
        let caps = {};
        try { caps = track.getCapabilities?.() || {}; }
        catch (error) { console.warn('Capacidades da câmara indisponíveis:',error); }
        cameraCapabilities = caps;
        // A focagem contínua ajuda em códigos impressos a diferentes distâncias.
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          try { await track.applyConstraints({advanced:[{focusMode:'continuous'}]}); }
          catch (error) { console.warn('Focagem contínua indisponível:',error); }
        }
        if (activeTrack !== track || generation !== token) return;
        const canZoom = caps.zoom && Number.isFinite(caps.zoom.min) &&
          Number.isFinite(caps.zoom.max) && caps.zoom.max > caps.zoom.min;
        if (canZoom) {
          zoomRange.min = String(caps.zoom.min);
          zoomRange.max = String(caps.zoom.max);
          zoomRange.step = String(caps.zoom.step || 0.1);
          const initial = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 1));
          zoomRange.value = String(initial);
          zoomValue.textContent = zoomLabel(initial);
          zoomControl.hidden = false;
        }
        if (caps.torch === true) {
          torchToggle.hidden = false;
        }
        cameraTools.hidden = !canZoom && caps.torch !== true;
        const settings = track.getSettings?.() || {};
        const resolution = settings.width && settings.height
          ? settings.width + '×' + settings.height
          : video.videoWidth && video.videoHeight
            ? video.videoWidth + '×' + video.videoHeight : 'a determinar';
        captureDiagnostics.textContent = 'Câmara: ' + resolution +
          (canZoom ? ' · Zoom ajustável' : '') + '. Aponte ao código e aguarde.';
        if (canZoom) await applyZoom();
      }
      // Mantém um segundo descodificador a analisar o vídeo. Alguns browsers
      // oferecem leitura nativa com melhor desempenho do que a biblioteca JS.
      async function startNativeDetection(token) {
        if (typeof BarcodeDetector === 'undefined') {
          captureDiagnostics.textContent = 'Leitura por biblioteca JavaScript. Câmara traseira preferencial.';
          return;
        }
        try {
          let formats = ['qr_code'];
          if (typeof BarcodeDetector.getSupportedFormats === 'function') {
            const supported = await BarcodeDetector.getSupportedFormats();
            formats = ['qr_code','ean_13','ean_8','code_128','code_39','code_93',
              'codabar','itf','upc_a','upc_e','data_matrix','pdf417']
              .filter(format => supported.includes(format));
          }
          if (!formats.length || generation !== token) return;
          nativeDetector = new BarcodeDetector({formats});
          const video = byId('reader').querySelector('video');
          if (!video || generation !== token) return;
          currentVideo = video;
          // A resolução e o zoom são apresentados por configureCameraControls().
          if (!activeTrack) captureDiagnostics.textContent = 'Leitura nativa e JavaScript ativas.';
          const tick = async () => {
            if (generation !== token || captureDone || !cameraRunning || !nativeDetector) return;
            try {
              if (video.readyState >= 2 && video.videoWidth > 0) {
                const matches = await nativeDetector.detect(video);
                if (matches && matches.length && generation === token) {
                  const match = matches[0];
                  successCamera(match.rawValue, {
                    result: {format: {formatName: (match.format || 'DESCONHECIDO').toUpperCase()}}
                  }, token);
                }
              }
            } catch (error) {
              // O motor JavaScript continua ativo se a API nativa falhar.
              console.warn('Leitor nativo indisponível:', error);
              nativeDetector = null;
              captureDiagnostics.textContent = 'Leitura por biblioteca JavaScript. Experimente fotografar se não reconhecer.';
            }
            if (generation === token && !captureDone && nativeDetector) {
              if (Date.now() - scanStartedAt > 4500 && activeTrack) {
                const settings = activeTrack.getSettings?.() || {};
                captureDiagnostics.textContent = 'Sem leitura: vídeo ' +
                  (settings.width || video.videoWidth) + '×' + (settings.height || video.videoHeight) +
                  '. Se estiver desfocado, escolha outra câmara ou fotografe o código.';
              }
              nativeTimer = setTimeout(tick, 170);
            }
          };
          nativeTimer = setTimeout(tick, 150);
        } catch (error) {
          console.warn('API nativa não disponível:', error);
          captureDiagnostics.textContent = 'Leitura por biblioteca JavaScript. Experimente fotografar se não reconhecer.';
        }
      }
      function successCamera(value, result, token) {
        if (generation !== token || captureDone || !captureMode) return;
        captureDone = true;
        const format = result?.result?.format?.formatName || 'DESCONHECIDO';
        if (add(value, format, 'camera', captureMode)) {
          void closeCapture();
        } else {
          captureDone = false;
        }
      }
      async function beginCapture(mode, selectedId = '') {
        if (captureBusy) return;
        if (!window.isSecureContext) {
          message('Para utilizar a câmara, abra a aplicação por HTTPS (Cloudflare Tunnel).', 'error');
          return;
        }
        if (typeof Html5Qrcode === 'undefined') {
          message('O leitor de códigos não carregou. Verifique a ligação à Internet e atualize a página.', 'error');
          return;
        }
        if (cameraRunning && captureMode && !selectedId) {
          showMode(mode);
          message('Câmara ativa. A próxima leitura será uma ' + (mode === 'entrada' ? 'ENTRADA' : 'SAÍDA') + '.', 'warn');
          return;
        }
        captureBusy = true;
        generation++;
        const token = generation;
        captureDone = false;
        showMode(mode);
        lastScan.textContent = 'A aguardar leitura de ' + (mode === 'entrada' ? 'entrada' : 'saída') + '…';
        capturePanel.hidden = false;
        document.body.classList.add('scanning');
        captureInfo.textContent = 'A preparar a câmara, aguarde…';
        try {
          await stopDecoder();
          if (generation !== token) return;
          const supported = globalThis.Html5QrcodeSupportedFormats;
          const formats = supported ? ['QR_CODE','EAN_13','EAN_8','CODE_128','CODE_39',
            'CODE_93','UPC_A','UPC_E','ITF','CODABAR','DATA_MATRIX','PDF_417']
            .map(name => supported[name]).filter(value => Number.isInteger(value)) : [];
          decoder = new Html5Qrcode('reader', {
            verbose:false,
            disableFlip:true,
            ...(formats.length ? {formatsToSupport:formats} : {})
          });
          cameras = await Html5Qrcode.getCameras();
          if (generation !== token) return;
          cameraSelect.replaceChildren();
          const automatic = document.createElement('option');
          automatic.value = '';
          automatic.textContent = 'Traseira (automático)';
          cameraSelect.appendChild(automatic);
          cameras.forEach((cam, i) => {
            const opt = document.createElement('option');
            opt.value = cam.id;
            opt.textContent = cam.label || ('Câmara ' + (i + 1));
            cameraSelect.appendChild(opt);
          });
          const rear = cameras.find(c => /back|rear|environment|traseir|facing back/i.test(c.label || ''));
          // Preferir o modo environment do browser (normalmente lente principal).
          // Seleção manual usa o deviceId escolhido, sem sobreposição de constraints.
          const target = selectedId || {facingMode:'environment'};
          const config = {
            fps: 20,
            videoConstraints: {
              ...(selectedId ? {deviceId:{exact:selectedId}} : {facingMode:'environment'}),
              width:{ideal:1920},
              height:{ideal:1080}
            }
          };
          const callback = (value, result) => successCamera(value, result, token);
          try {
            await decoder.start(target, config, callback, () => {});
          } catch (firstError) {
            if (selectedId) throw firstError;
            // Se constraints de resolução ou de lente falharem, voltar a um
            // arranque simples, permitindo selecionar a câmara manualmente.
            const fallback = rear ? rear.id : {facingMode:'environment'};
            await decoder.start(fallback, {fps:10}, callback, () => {});
          }
          cameraRunning = true;
          scanStartedAt = Date.now();
          if (generation !== token) { await closeCapture(); return; }
          const reticle = document.createElement('div');
          reticle.className = 'scanner-reticle';
          reticle.setAttribute('aria-hidden', 'true');
          byId('reader').appendChild(reticle);
          cameraSelect.value = typeof target === 'string' ? target : '';
          captureInfo.textContent = (mode === 'entrada' ? 'ENTRADA' : 'SAÍDA') + ': aponte ao código até ser reconhecido.';
          captureDiagnostics.textContent = 'Vídeo ativo. A verificar os leitores e a focagem…';
          void startNativeDetection(token);
          void configureCameraControls(token);
          message('Câmara ativa. Aponte ao QR code ou código de barras.', '');
        } catch (error) {
          await stopDecoder();
          captureInfo.textContent = 'Câmara indisponível. Pode tentar outra vez ou escolher uma fotografia.';
          message(cameraError(error), 'error');
        } finally {
          captureBusy = false;
        }
      }
      async function scanPhoto(file) {
        if (!captureMode || captureBusy) return;
        if (typeof Html5Qrcode === 'undefined') {
          message('A biblioteca de leitura não carregou.', 'error');
          return;
        }
        if (!file.type.startsWith('image/')) {
          message('Selecione uma fotografia válida.', 'warn');
          return;
        }
        captureBusy = true;
        generation++;
        captureDone = false;
        const mode = captureMode;
        try {
          await stopDecoder();
          decoder = new Html5Qrcode('reader', {verbose:false});
          captureInfo.textContent = 'A analisar a fotografia…';
          const result = await decoder.scanFileV2(file, true);
          const text = result.decodedText;
          const format = result.result?.format?.formatName || 'DESCONHECIDO';
          if (add(text, format, 'camera', mode)) {
            await stopDecoder();
            captureMode = null;
            capturePanel.hidden = true;
            document.body.classList.remove('scanning');
            movementIn.setAttribute('aria-pressed','false');
            movementOut.setAttribute('aria-pressed','false');
          }
        } catch (error) {
          message('O código não foi reconhecido na fotografia. Tente uma imagem mais nítida, com o código completo e bem iluminado.', 'warn');
          captureInfo.textContent = 'Fotografia não reconhecida. Tente novamente ou use a câmara.';
        } finally {
          captureBusy = false;
        }
      }

      try {
        const stored = localStorage.getItem(KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          records = Array.isArray(parsed) ? parsed.filter(isRecord) : [];
        }
      } catch (error) {
        storageAvailable = false;
        message('Não foi possível recuperar o histórico local. Não apague os dados antes de recuperar uma exportação.', 'error');
      }
      render();
      message('Toque em «Registar entrada» ou «Registar saída» para abrir a câmara.', '');
      movementIn.addEventListener('click', () => { void beginCapture('entrada'); });
      movementOut.addEventListener('click', () => { void beginCapture('saida'); });
      captureCancel.addEventListener('click', () => { if (!captureBusy) void closeCapture(); });
      cameraSelect.addEventListener('change', () => {
        if (captureMode && !captureBusy) void beginCapture(captureMode, cameraSelect.value);
      });
      zoomRange.addEventListener('input', () => { void applyZoom(); });
      torchToggle.addEventListener('click', () => { void toggleTorch(); });
      capturePhoto.addEventListener('click', () => { if (!captureBusy) captureFile.click(); });
      captureTakePhoto.addEventListener('click', () => { if (!captureBusy) captureCameraFile.click(); });
      for (const input of [captureFile, captureCameraFile]) {
        input.addEventListener('change', () => {
          const file = input.files && input.files[0];
          input.value = '';
          if (file) void scanPhoto(file);
        });
      }
      byId('manual-form').addEventListener('submit', event => {
        event.preventDefault();
        const input = byId('manual-value');
        const mode = requireOtherMode();
        if (!mode) return;
        const value = input.value.trim();
        if (value && add(value, 'MANUAL', 'manual', mode)) {input.value = ''; input.focus();}
      });
      function scannerSubmit() {
        const mode = requireOtherMode();
        if (!mode) return;
        const value = scannerInput.value;
        if (!value.trim()) {scannerInput.value = ''; scannerInput.focus();return;}
        if (add(value, 'DESCONHECIDO', 'scanner_hid', mode)) {
          scannerInput.value = '';
          scannerInput.focus();
        }
      }
      byId('scanner-form').addEventListener('submit', event => {
        event.preventDefault();
        scannerSubmit();
      });
      scannerInput.addEventListener('keydown', event => {
        if (event.key === 'Tab') {event.preventDefault();scannerSubmit();}
      });
      scannerInput.addEventListener('focus', () => {
        scannerState.textContent = 'Pronta para leitura';
        scannerState.className = 'scanner-state ready';
      });
      scannerInput.addEventListener('blur', () => {
        scannerState.textContent = 'Em pausa: clique em «Ativar pistola»';
        scannerState.className = 'scanner-state';
      });
      scannerArm.addEventListener('click', () => scannerInput.focus());
      exportButton.addEventListener('click', () => {
        const content = records.map(r => JSON.stringify(r)).join('\n') + '\n';
        const blob = new Blob([content], {type:'text/plain;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'leituras_' + new Date().toISOString().replace(/[-:]/g,'').replace(/T/,'_').slice(0,15) + '.txt';
        document.body.appendChild(a);a.click();a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        message('TXT gerado. Confirme que o ficheiro foi guardado no dispositivo.', 'success');
      });
      clearButton.addEventListener('click', () => {
        if (!confirm('Apagar todas as ' + records.length + ' leituras deste dispositivo? Exporte primeiro o TXT.')) return;
        if (save([])) message('Histórico local apagado.', 'success');
      });
      const fileImport = byId('file-import');
      byId('backup-import').addEventListener('click', () => fileImport.click());
      fileImport.addEventListener('change', async () => {
        const file = fileImport.files && fileImport.files[0];
        fileImport.value = '';
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {message('O ficheiro excede 5 MB.', 'warn');return;}
        try {
          const imported = ScanDomain.parseJsonLines(await file.text());
          const merge = ScanDomain.mergeRecords(records, imported);
          if (save(merge.records)) message('Importação concluída: ' + merge.inserted + ' leituras novas.', 'success');
        } catch (error) {
          message('Não foi possível importar o ficheiro. Utilize um TXT exportado pela aplicação.', 'error');
        }
      });
      window.addEventListener('storage', event => {
        if (event.key !== KEY) return;
        try {
          const loaded = event.newValue ? JSON.parse(event.newValue) : [];
          if (!Array.isArray(loaded) || !loaded.every(isRecord)) throw new Error('Histórico inválido');
          records = loaded;
          render();
          message('O histórico foi atualizado noutra janela deste browser.', 'warn');
        } catch (error) {
          message('Alteração externa inválida. Faça uma cópia de segurança antes de continuar.', 'error');
        }
      });
      window.addEventListener('load', () => {
        if (!window.isSecureContext) {
          message('A câmara exige HTTPS. Utilize o endereço do Cloudflare Tunnel.', 'warn');
        } else if (typeof Html5Qrcode === 'undefined') {
          message('A biblioteca da câmara não carregou. Verifique a ligação à Internet.', 'warn');
        }
      });
    })();
  