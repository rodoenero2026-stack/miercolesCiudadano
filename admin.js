// Variables globales de la App
    let allAppointments = [];      // Lista completa de citas del backend
    let filteredAppointments = []; // Lista filtrada según criterios
    let currentWednesday = null;   // Objeto Date que representa el miércoles actualmente seleccionado
    let apiToken = "";             // Token JWT para autorizar consultas
    
    // Paginación
    let currentPage = 1;
    const itemsPerPage = 10;

    // Horarios oficiales del Miércoles Ciudadano (coinciden con index.html)
    const TIME_SLOTS = [
      "08:00 - 08:20", "08:20 - 08:40", "08:40 - 09:00",
      "09:00 - 09:20", "09:20 - 09:40", "09:40 - 10:00",
      "10:00 - 10:20", "10:20 - 10:40", "10:40 - 11:00",
      "11:00 - 11:20", "11:20 - 11:40", "11:40 - 12:00",
      "12:00 - 12:20", "12:20 - 12:40", "12:40 - 13:00",
      "13:00 - 13:20", "13:20 - 13:40", "13:40 - 14:00",
      "14:00 - 14:20", "14:20 - 14:40", "14:40 - 15:00"
    ];

    // Al iniciar la carga
    window.addEventListener('DOMContentLoaded', () => {
      // 1. Revisar si hay sesión guardada
      const savedToken = localStorage.getItem('adminToken');
      if (savedToken) {
        apiToken = savedToken;
        document.getElementById('loginView').style.display = 'none';
        document.getElementById('adminApp').style.display = 'flex';
        initAdminPanel();
      } else {
        // Asegurarse de que el input de contraseña tenga focus
        document.getElementById('passwordInput').focus();
      }

      // Restricción del input de fecha de reagendamiento para ser solo miércoles
      const rescheduleDateInput = document.getElementById('rescheduleFecha');
      rescheduleDateInput.addEventListener('input', (e) => {
        const val = e.target.value;
        if (!val) return;
        
        const parts = val.split('-');
        const dateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        if (dateObj.getUTCDay() !== 3) {
          showAlert('Error de fecha', 'Las citas solo pueden programarse los días miércoles.', 'error');
          e.target.value = '';
        }
      });
      
      // Restricción del input de fecha de bloqueo para ser solo miércoles
      const blockedDateInput = document.getElementById('blockedDateInput');
      if (blockedDateInput) {
        blockedDateInput.addEventListener('input', (e) => {
          const val = e.target.value;
          if (!val) return;
          
          const parts = val.split('-');
          const dateObj = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
          if (dateObj.getUTCDay() !== 3) {
            showAlert('Error de fecha', 'Las fechas bloqueadas solo pueden ser días miércoles.', 'error');
            e.target.value = '';
          }
        });
      }

      // Estilos mínimos en mobile para fecha
      const today = new Date();
      rescheduleDateInput.min = today.toISOString().split('T')[0];
      if (blockedDateInput) {
        blockedDateInput.min = today.toISOString().split('T')[0];
      }
    });

    // Mostrar loading
    function showLoading(show) {
      const loader = document.getElementById('loadingOverlay');
      if (show) {
        loader.classList.add('show');
      } else {
        loader.classList.remove('show');
      }
    }

    // Sistema de Alertas
    function showAlert(title, message, type = 'success') {
      const container = document.getElementById('alertContainer');
      const alertId = 'alert_' + Date.now();
      
      let svgIcon = '';
      if (type === 'success') {
        svgIcon = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>`;
      } else if (type === 'error') {
        svgIcon = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v5z"/></svg>`;
      } else {
        svgIcon = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>`;
      }

      const alertHtml = `
        <div id="${alertId}" class="alert alert-${type}">
          ${svgIcon}
          <div class="alert-content">
            <div class="alert-title">${title}</div>
            <div>${message}</div>
          </div>
          <button class="alert-close" onclick="removeAlert('${alertId}')">&times;</button>
        </div>
      `;
      
      container.insertAdjacentHTML('beforeend', alertHtml);

      // Auto-eliminar después de 4 segundos
      setTimeout(() => {
        removeAlert(alertId);
      }, 4000);
    }

    function removeAlert(id) {
      const alertEl = document.getElementById(id);
      if (alertEl) {
        alertEl.style.opacity = '0';
        alertEl.style.transform = 'translateX(50px)';
        alertEl.style.transition = 'all 0.3s ease';
        setTimeout(() => alertEl.remove(), 300);
      }
    }

    // MANEJAR LOGIN
    async function handleLogin(event) {
      event.preventDefault();
      const username = document.getElementById('usernameInput').value;
      const password = document.getElementById('passwordInput').value;

      showLoading(true);
      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Credenciales inválidas');
        }

        apiToken = data.token;
        localStorage.setItem('adminToken', apiToken);
        
        document.getElementById('loginView').style.display = 'none';
        document.getElementById('adminApp').style.display = 'flex';
        
        showAlert('Sesión Iniciada', 'Bienvenido al panel de administración.', 'success');
        initAdminPanel();
      } catch (error) {
        showAlert('Error de Login', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // MANEJAR LOGOUT
    function handleLogout() {
      apiToken = "";
      localStorage.removeItem('adminToken');
      document.getElementById('adminApp').style.display = 'none';
      document.getElementById('loginView').style.display = 'flex';
      
      // Limpiar inputs
      document.getElementById('passwordInput').value = '';
      document.getElementById('passwordInput').focus();
      
      showAlert('Sesión Cerrada', 'Ha cerrado sesión correctamente.', 'info');
    }

    // CONTROLADOR DE LLAMADAS API CON AUTENTICACIÓN
    async function fetchWithAuth(url, options = {}) {
      if (!options.headers) {
        options.headers = {};
      }
      options.headers['Authorization'] = `Bearer ${apiToken}`;

      try {
        const response = await fetch(url, options);
        
        if (response.status === 401 || response.status === 403) {
          // Token expirado o inválido
          handleLogout();
          throw new Error('Su sesión ha expirado. Por favor, inicie sesión nuevamente.');
        }

        return response;
      } catch (error) {
        console.error('Error de red/API:', error);
        throw error;
      }
    }

    // INICIALIZACIÓN DEL PANEL DE ADMINISTRACIÓN
    async function initAdminPanel() {
      // 1. Establecer el miércoles actual (buscar el miércoles más cercano)
      setTodayWednesday();
      
      // 2. Cargar los datos del backend
      await loadAppointmentsData();
    }

    // Obtener todos los miércoles (para filtros)
    function populateWednesdayFilter() {
      const dateFilter = document.getElementById('dateFilter');
      // Limpiar opciones anteriores pero mantener la primera
      dateFilter.innerHTML = '<option value="">Todos los miércoles</option>';
      
      // Obtener fechas únicas de miércoles existentes en las citas
      const uniqueDates = [...new Set(allAppointments.map(app => app.fecha))];
      // Ordenar fechas descendente
      uniqueDates.sort((a, b) => b.localeCompare(a));

      uniqueDates.forEach(fecha => {
        const option = document.createElement('option');
        option.value = fecha;
        
        // Dar formato amigable
        const parts = fecha.split('-');
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
        option.textContent = `${parts[2]}-${meses[dateObj.getMonth()]}-${parts[0]} (Miércoles)`;
        dateFilter.appendChild(option);
      });
    }

    // Cargar información completa de citas
    async function loadAppointmentsData() {
      showLoading(true);
      try {
        const response = await fetchWithAuth('/api/citas');
        if (!response.ok) {
          throw new Error('No se pudieron obtener las citas.');
        }
        
        allAppointments = await response.json();
        filteredAppointments = [...allAppointments];
        
        // Llenar selector de miércoles de los filtros
        populateWednesdayFilter();
        
        // Renderizar vistas activas
        renderActiveTab();
        
        // Actualizar estadísticas generales
        updateStats();

      } catch (error) {
        showAlert('Error de Carga', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // Cargar fecha actual o miércoles más cercano
    function setTodayWednesday() {
      const today = new Date();
      // En JavaScript, 0 = Domingo, 1 = Lunes, ..., 3 = Miércoles, ..., 6 = Sábado
      const currentDay = today.getDay();
      
      // Calcular cuántos días sumar o restar para llegar al miércoles de la semana actual
      // Si hoy es miércoles (3), sumamos 0. Si es jueves (4), restamos 1, etc.
      let diff = 3 - currentDay;
      
      const targetWednesday = new Date(today);
      targetWednesday.setDate(today.getDate() + diff);
      
      currentWednesday = targetWednesday;
      updateWednesdayLabel();
    }

    // Cambiar entre miércoles anterior o siguiente
    function navigateWednesday(direction) {
      // Dirección: -1 (anterior), 1 (siguiente)
      currentWednesday.setDate(currentWednesday.getDate() + (direction * 7));
      updateWednesdayLabel();
      renderCalendarTimeline();
    }

    // Formatear etiqueta de la fecha en pantalla
    function updateWednesdayLabel() {
      const label = document.getElementById('currentWednesdayLabel');
      
      const meses = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
      ];
      
      const day = currentWednesday.getDate();
      const monthStr = meses[currentWednesday.getMonth()];
      const year = currentWednesday.getFullYear();
      
      label.textContent = `Miércoles, ${day} de ${monthStr} de ${year}`;
      
      // Habilitar/Deshabilitar botón de PDF dependiente del tab y fecha
      checkPdfBtnStatus();
    }

    function checkPdfBtnStatus() {
      const formattedDate = formatDateString(currentWednesday);
      const exportBtn = document.getElementById('exportPdfBtn');
      
      if (!exportBtn) return;

      const hasAppointmentsThisDay = allAppointments.some(app => app.fecha === formattedDate && app.estado !== 'cancelada');
      
      if (hasAppointmentsThisDay) {
        exportBtn.removeAttribute('disabled');
      } else {
        exportBtn.setAttribute('disabled', 'true');
      }
    }

    // Formatear objeto Date en YYYY-MM-DD
    function formatDateString(dateObj) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    // CAMBIAR PESTAÑA DEL MENÚ
    function switchTab(tabId) {
      // Cambiar clase active en botones de navegación
      const buttons = document.querySelectorAll('.tab-btn');
      buttons.forEach(btn => btn.classList.remove('active'));
      
      // Buscar botón correspondiente
      const clickedBtn = Array.from(buttons).find(btn => {
        if (tabId === 'calendarTab') return btn.textContent.includes('Calendario');
        if (tabId === 'listTab') return btn.textContent.includes('Listado');
        if (tabId === 'statsTab') return btn.textContent.includes('Estadísticas');
        if (tabId === 'blockedTab') return btn.textContent.includes('Fechas');
        if (tabId === 'adminsTab') return btn.textContent.includes('Admins');
        return false;
      });
      
      if (clickedBtn) clickedBtn.classList.add('active');

      // Cambiar visibilidad de paneles
      const panels = document.querySelectorAll('.tab-panel');
      panels.forEach(panel => panel.classList.remove('active'));
      document.getElementById(tabId).classList.add('active');

      renderActiveTab();
      checkPdfBtnStatus();
    }

    // RENDERIZAR VISTA ACTIVA
    function renderActiveTab() {
      const activePanel = document.querySelector('.tab-panel.active');
      if (activePanel.id === 'calendarTab') {
        renderCalendarTimeline();
      } else if (activePanel.id === 'listTab') {
        currentPage = 1;
        applyFilters();
      } else if (activePanel.id === 'statsTab') {
        updateStats();
      } else if (activePanel.id === 'blockedTab') {
        loadBlockedDates();
      } else if (activePanel.id === 'adminsTab') {
        loadAdmins();
      }
    }

    // --- LOGICA DE RENDERIZADO TAB 1: TIMELINE / CALENDARIO SEMANAL ---
    function renderCalendarTimeline() {
      const listEl = document.getElementById('timelineList');
      listEl.innerHTML = '';
      
      const formattedDate = formatDateString(currentWednesday);
      
      // Filtrar citas del miércoles seleccionado
      const dayAppointments = allAppointments.filter(app => app.fecha === formattedDate);
      
      document.getElementById('wednesdayCountBadge').textContent = `${dayAppointments.filter(c => c.estado !== 'cancelada').length} / 15`;
      
      // Renderizar los 21 bloques de horario
      TIME_SLOTS.forEach(slot => {
        // Encontrar cita en este horario
        const appointment = dayAppointments.find(app => app.hora === slot);
        
        const row = document.createElement('div');
        row.className = 'timeline-row';
        
        const timeCell = document.createElement('div');
        timeCell.className = 'timeline-time';
        // Mostrar la hora de inicio amigable
        timeCell.textContent = slot.split(' - ')[0];
        
        const contentCell = document.createElement('div');
        contentCell.className = 'timeline-content';
        
        if (appointment) {
          let badgeClass = 'badge-pendiente';
          if (appointment.estado === 'confirmada') badgeClass = 'badge-confirmada';
          if (appointment.estado === 'cancelada') badgeClass = 'badge-cancelada';
          
          let notesHtml = '';
          if (appointment.notas_admin && appointment.notas_admin !== 'Folio asignado al agendar.' && appointment.notas_admin.trim() !== '') {
            notesHtml = `<div class="citizen-notes"><strong>Notas admin:</strong> "${appointment.notas_admin}"</div>`;
          }

          contentCell.innerHTML = `
            <div class="slot-booked">
              <div class="citizen-brief">
                <div class="citizen-name-folio">
                  <span class="citizen-name">${escapeHtml(appointment.nombre)}</span>
                  <span class="citizen-folio">${appointment.folio}</span>
                  <span class="badge ${badgeClass}">${appointment.estado}</span>
                </div>
                <div class="citizen-details">
                  <span>
                    <svg viewBox="0 0 24 24"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                    Tel: ${appointment.telefono}
                  </span>
                  <span>
                    <svg viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>
                    Colonia: ${escapeHtml(appointment.colonia)}
                  </span>
                </div>
                <div class="citizen-motivo">
                  <strong>Tema:</strong> ${escapeHtml(appointment.motivo)}
                </div>
                ${notesHtml}
              </div>
              <div class="actions-cell">
                ${appointment.estado !== 'confirmada' ? `
                  <button onclick="changeAppointmentStatus(${appointment.id}, 'confirmada')" class="btn btn-sm btn-success" title="Confirmar Cita">
                    Confirmar
                  </button>
                ` : ''}
                ${appointment.estado !== 'cancelada' ? `
                  <button onclick="changeAppointmentStatus(${appointment.id}, 'cancelada')" class="btn btn-sm btn-danger" title="Cancelar Cita">
                    Cancelar
                  </button>
                ` : ''}
                <button onclick="openRescheduleModal(${JSON.stringify(appointment).replace(/"/g, '&quot;')})" class="btn btn-sm btn-outline" title="Reagendar Cita">
                  Reagendar
                </button>
                <button onclick="openEditModal(${JSON.stringify(appointment).replace(/"/g, '&quot;')})" class="btn btn-sm btn-muted" title="Administrar Notas">
                  Notas
                </button>
                <button onclick="resendConfirmationEmail(${appointment.id})" class="btn btn-sm btn-outline" title="Reenviar Correo de Confirmación" style="border-color: var(--secondary); color: var(--secondary-dark);">
                  Reenviar Correo
                </button>
              </div>
            </div>
          `;
        } else {
          contentCell.innerHTML = `
            <div class="slot-empty">
              Horario Disponible para agendar
            </div>
            <div class="actions-cell">
              <button onclick="quickSchedule('${formattedDate}', '${slot}')" class="btn btn-sm btn-outline btn-primary" style="padding: 0.3rem 0.6rem; font-size: 0.7rem;">
                + Registrar Cita
              </button>
            </div>
          `;
        }
        
        row.appendChild(timeCell);
        row.appendChild(contentCell);
        listEl.appendChild(row);
      });
      
      checkPdfBtnStatus();
    }

    // Registro rápido desde el calendario (redirige o avisa)
    function quickSchedule(fecha, slot) {
      const confirmAction = confirm(`¿Desea ir al formulario de registro ciudadano para agendar en la fecha ${fecha} y horario ${slot}?`);
      if (confirmAction) {
        window.open(`/index.html?fecha=${fecha}&hora=${encodeURIComponent(slot)}#agendar`, '_blank');
      }
    }

    // --- LOGICA DE RENDERIZADO TAB 2: LISTADO DE CITAS Y TABLA ---
    function applyFilters() {
      const searchVal = document.getElementById('searchFilter').value.toLowerCase().trim();
      const dateVal = document.getElementById('dateFilter').value;
      const statusVal = document.getElementById('statusFilter').value;
      const motivoVal = document.getElementById('motivoFilter').value.toLowerCase().trim();

      filteredAppointments = allAppointments.filter(app => {
        // Filtro búsqueda general
        const matchSearch = searchVal === "" || 
                            app.folio.toLowerCase().includes(searchVal) ||
                            app.nombre.toLowerCase().includes(searchVal) ||
                            app.colonia.toLowerCase().includes(searchVal);
                            
        // Filtro fecha
        const matchDate = dateVal === "" || app.fecha === dateVal;
        
        // Filtro estado
        const matchStatus = statusVal === "" || app.estado === statusVal;
        
        // Filtro motivo
        const matchMotivo = motivoVal === "" || app.motivo.toLowerCase().includes(motivoVal);

        return matchSearch && matchDate && matchStatus && matchMotivo;
      });

      renderTable();
    }

    function clearFilters() {
      document.getElementById('searchFilter').value = "";
      document.getElementById('dateFilter').value = "";
      document.getElementById('statusFilter').value = "";
      document.getElementById('motivoFilter').value = "";
      applyFilters();
    }

    function renderTable() {
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = '';

      // Paginación
      const totalItems = filteredAppointments.length;
      document.getElementById('pagTotal').textContent = totalItems;

      if (totalItems === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty">No se encontraron citas con los filtros aplicados.</td></tr>`;
        document.getElementById('pagShowing').textContent = "0";
        document.getElementById('btnPrevPage').setAttribute('disabled', 'true');
        document.getElementById('btnNextPage').setAttribute('disabled', 'true');
        return;
      }

      const totalPages = Math.ceil(totalItems / itemsPerPage);
      if (currentPage > totalPages) currentPage = totalPages;
      if (currentPage < 1) currentPage = 1;

      const startIndex = (currentPage - 1) * itemsPerPage;
      const endIndex = Math.min(startIndex + itemsPerPage, totalItems);
      
      document.getElementById('pagShowing').textContent = `${startIndex + 1}-${endIndex}`;

      // Botones navegación
      if (currentPage === 1) {
        document.getElementById('btnPrevPage').setAttribute('disabled', 'true');
      } else {
        document.getElementById('btnPrevPage').removeAttribute('disabled');
      }

      if (currentPage === totalPages) {
        document.getElementById('btnNextPage').setAttribute('disabled', 'true');
      } else {
        document.getElementById('btnNextPage').removeAttribute('disabled');
      }

      const paginatedItems = filteredAppointments.slice(startIndex, endIndex);

      paginatedItems.forEach(appointment => {
        const row = document.createElement('tr');
        
        let badgeClass = 'badge-pendiente';
        if (appointment.estado === 'confirmada') badgeClass = 'badge-confirmada';
        if (appointment.estado === 'cancelada') badgeClass = 'badge-cancelada';

        let notesHtml = '';
        if (appointment.notas_admin && appointment.notas_admin !== 'Folio asignado al agendar.' && appointment.notas_admin.trim() !== '') {
          notesHtml = `<div class="table-notes-box">${escapeHtml(appointment.notas_admin)}</div>`;
        } else {
          notesHtml = `<span style="color: var(--text-muted); font-size: 0.75rem;">Sin observaciones</span>`;
        }

        row.innerHTML = `
          <td style="font-family: 'Montserrat', sans-serif; font-weight: 700; color: var(--secondary-dark);">${appointment.folio}</td>
          <td><strong>${formatShortDate(appointment.fecha)}</strong></td>
          <td style="white-space: nowrap; font-weight: 600;">${appointment.hora.split(' - ')[0]}</td>
          <td>
            <div class="table-citizen-name">${escapeHtml(appointment.nombre)}</div>
          </td>
          <td>
            <div class="table-citizen-meta">
              <span><strong>Tel:</strong> ${appointment.telefono}</span>
              <span><strong>Colonia:</strong> ${escapeHtml(appointment.colonia)}</span>
            </div>
          </td>
          <td style="max-width: 200px;">
            <div style="font-weight: 600; font-size: 0.8rem;">${escapeHtml(appointment.motivo)}</div>
          </td>
          <td>
            <div class="table-notes-container">${notesHtml}</div>
          </td>
          <td>
            <span class="badge ${badgeClass}">${appointment.estado}</span>
          </td>
          <td>
            <div class="actions-cell" style="justify-content: center;">
              ${appointment.estado !== 'confirmada' ? `
                <button onclick="changeAppointmentStatus(${appointment.id}, 'confirmada')" class="btn btn-sm btn-success" title="Confirmar">
                  Conf
                </button>
              ` : ''}
              ${appointment.estado !== 'cancelada' ? `
                <button onclick="changeAppointmentStatus(${appointment.id}, 'cancelada')" class="btn btn-sm btn-danger" title="Cancelar">
                  Canc
                </button>
              ` : ''}
              <button onclick="openRescheduleModal(${JSON.stringify(appointment).replace(/"/g, '&quot;')})" class="btn btn-sm btn-outline" title="Reagendar">
                Reag
              </button>
              <button onclick="openEditModal(${JSON.stringify(appointment).replace(/"/g, '&quot;')})" class="btn btn-sm btn-muted" title="Administrar Notas">
                Notas
              </button>
              <button onclick="resendConfirmationEmail(${appointment.id})" class="btn btn-sm btn-outline" title="Reenviar Correo de Confirmación" style="border-color: var(--secondary); color: var(--secondary-dark);">
                Correo
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(row);
      });
    }

    function changePage(direction) {
      currentPage += direction;
      renderTable();
    }

    function formatShortDate(dateStr) {
      const parts = dateStr.split('-');
      const dateObj = new Date(parts[0], parts[1]-1, parts[2]);
      const meses = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      return `${parts[2]}-${meses[dateObj.getMonth()]}-${parts[0]}`;
    }


    // --- LOGICA DE RENDERIZADO TAB 3: ESTADÍSTICAS ---
    function updateStats() {
      // 1. Histórico Total
      document.getElementById('statTotalCitas').textContent = allAppointments.length;

      // 2. Citas del mes actual (según fecha de hoy local)
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = String(today.getMonth() + 1).padStart(2, '0');
      const prefixMonth = `${currentYear}-${currentMonth}`; // "YYYY-MM"

      const monthAppointments = allAppointments.filter(app => app.fecha.startsWith(prefixMonth));
      document.getElementById('statCitasMes').textContent = monthAppointments.length;

      // 3. Atendidas/Confirmadas vs Pendientes
      const confirmedCount = allAppointments.filter(app => app.estado === 'confirmada').length;
      const pendingCount = allAppointments.filter(app => app.estado === 'pendiente').length;
      const cancelledCount = allAppointments.filter(app => app.estado === 'cancelada').length;

      document.getElementById('statCitasConfirmadas').textContent = confirmedCount;
      document.getElementById('statCitasPendientes').textContent = pendingCount;

      // 4. Grafico Donut de Distribución
      const donutTotal = confirmedCount + pendingCount + cancelledCount;
      document.getElementById('donutTotalText').textContent = donutTotal;

      if (donutTotal > 0) {
        const pConfirm = (confirmedCount / donutTotal) * 100;
        const pPending = (pendingCount / donutTotal) * 100;
        const pCancel = (cancelledCount / donutTotal) * 100;

        document.getElementById('legendConfirmadaVal').textContent = `${Math.round(pConfirm)}% (${confirmedCount})`;
        document.getElementById('legendPendienteVal').textContent = `${Math.round(pPending)}% (${pendingCount})`;
        document.getElementById('legendCanceladaVal').textContent = `${Math.round(pCancel)}% (${cancelledCount})`;

        // Configurar los segmentos en el SVG circular
        const segConfirm = document.getElementById('donutSegmentConfirmada');
        const segPending = document.getElementById('donutSegmentPendiente');
        const segCancel = document.getElementById('donutSegmentCancelada');

        segConfirm.setAttribute('stroke-dasharray', `${pConfirm} 100`);
        
        segPending.setAttribute('stroke-dasharray', `${pPending} 100`);
        segPending.setAttribute('stroke-dashoffset', `-${pConfirm}`);
        
        segCancel.setAttribute('stroke-dasharray', `${pCancel} 100`);
        segCancel.setAttribute('stroke-dashoffset', `-${pConfirm + pPending}`);
      } else {
        document.getElementById('legendConfirmadaVal').textContent = '0%';
        document.getElementById('legendPendienteVal').textContent = '0%';
        document.getElementById('legendCanceladaVal').textContent = '0%';
      }

      // 5. Grafico de Motivos/Temas más frecuentes
      const reasonsMap = {};
      allAppointments.forEach(app => {
        let m = app.motivo.trim();
        let group = "Otros Temas / Peticiones Generales";
        
        const textLower = m.toLowerCase();
        if (textLower.includes('agua') || textLower.includes('drenaje') || textLower.includes('alcant')) {
          group = "Agua Potable y Alcantarillado";
        } else if (textLower.includes('alumbrado') || textLower.includes('luz') || textLower.includes('electr')) {
          group = "Alumbrado Público y Electrificación";
        } else if (textLower.includes('calle') || textLower.includes('bache') || textLower.includes('paviment') || textLower.includes('carreter') || textLower.includes('obra')) {
          group = "Obras Públicas y Vialidad";
        } else if (textLower.includes('seguridad') || textLower.includes('polic') || textLower.includes('patrull') || textLower.includes('robo')) {
          group = "Seguridad Ciudadana y Vigilancia";
        } else if (textLower.includes('basura') || textLower.includes('limpia') || textLower.includes('ecolog') || textLower.includes('parque')) {
          group = "Servicios Públicos y Ecología";
        } else if (textLower.includes('apoyo') || textLower.includes('despensa') || textLower.includes('beca') || textLower.includes('social') || textLower.includes('salud')) {
          group = "Programas Sociales y Salud";
        } else {
          group = m.length > 35 ? m.substring(0, 32) + '...' : m;
        }

        reasonsMap[group] = (reasonsMap[group] || 0) + 1;
      });

      // Ordenar y renderizar barras
      const sortedReasons = Object.entries(reasonsMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5

      const maxReasonVal = sortedReasons.length > 0 ? sortedReasons[0][1] : 1;
      const reasonsListEl = document.getElementById('reasonsChartList');
      reasonsListEl.innerHTML = '';

      if (sortedReasons.length === 0) {
        reasonsListEl.innerHTML = '<div style="color: var(--text-muted); font-style: italic; font-size: 0.8rem; text-align: center;">No hay datos registrados aún.</div>';
      }

      sortedReasons.forEach(([label, value]) => {
        const pct = (value / maxReasonVal) * 100;
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = `
          <div class="bar-label-row">
            <span>${label}</span>
            <strong>${value} petición(es)</strong>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${pct}%;"></div>
          </div>
        `;
        reasonsListEl.appendChild(row);
      });

      // 6. Colonias con más solicitudes
      const coloniesMap = {};
      allAppointments.forEach(app => {
        const col = app.colonia.trim();
        coloniesMap[col] = (coloniesMap[col] || 0) + 1;
      });

      const sortedColonies = Object.entries(coloniesMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5

      const maxColVal = sortedColonies.length > 0 ? sortedColonies[0][1] : 1;
      const coloniesListEl = document.getElementById('coloniasChartList');
      coloniesListEl.innerHTML = '';

      if (sortedColonies.length === 0) {
        coloniesListEl.innerHTML = '<div style="color: var(--text-muted); font-style: italic; font-size: 0.8rem; text-align: center;">No hay colonias registradas aún.</div>';
      }

      sortedColonies.forEach(([label, value]) => {
        const pct = (value / maxColVal) * 100;
        const row = document.createElement('div');
        row.className = 'bar-row';
        row.innerHTML = `
          <div class="bar-label-row">
            <span>Col. / Fracc. ${label}</span>
            <strong>${value} cita(s)</strong>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width: ${pct}%; background: linear-gradient(90deg, var(--secondary) 0%, var(--secondary-light) 100%);"></div>
          </div>
        `;
        coloniesListEl.appendChild(row);
      });
    }

    // --- LOGICA DE CAMBIAR ESTADO DE CITA DIRECTAMENTE ---
    async function changeAppointmentStatus(id, newStatus) {
      if (newStatus === 'cancelada') {
        const confirmCancel = confirm('¿Está seguro de que desea CANCELAR esta cita? Se enviará una notificación por correo electrónico al ciudadano.');
        if (!confirmCancel) return;
      }

      showLoading(true);
      try {
        const response = await fetchWithAuth(`/api/citas/${id}/estado`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            estado: newStatus,
            notas_admin: newStatus === 'confirmada' ? 'Cita confirmada por el administrador.' : 'Cita cancelada por el administrador.'
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Error al actualizar el estado.');
        }

        showAlert('Cita Actualizada', `La cita con Folio ${data.appointment.folio} ha cambiado a: ${newStatus.toUpperCase()}`, 'success');
        
        await loadAppointmentsData();
      } catch (error) {
        showAlert('Error de Operación', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // --- LOGICA DE MODAL: EDITAR NOTAS / DETALLES ---
    function openEditModal(appointment) {
      document.getElementById('editCitaId').value = appointment.id;
      document.getElementById('editCitizenName').textContent = appointment.nombre;
      document.getElementById('editCitizenDetails').textContent = `Tel: ${appointment.telefono} | Colonia: ${appointment.colonia}`;
      document.getElementById('editCitaFolio').textContent = appointment.folio;
      document.getElementById('editCitaFechaHora').textContent = `${formatShortDate(appointment.fecha)} a las ${appointment.hora.split(' - ')[0]}`;
      document.getElementById('editCitaMotivo').textContent = appointment.motivo;
      
      document.getElementById('editEstado').value = appointment.estado;
      document.getElementById('editNotasAdmin').value = appointment.notas_admin === 'Folio asignado al agendar.' ? '' : (appointment.notas_admin || '');
      
      openModal('editModal');
    }

    async function saveCitaEstado() {
      const id = document.getElementById('editCitaId').value;
      const estado = document.getElementById('editEstado').value;
      const notas_admin = document.getElementById('editNotasAdmin').value.trim();

      showLoading(true);
      try {
        const response = await fetchWithAuth(`/api/citas/${id}/estado`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            estado,
            notas_admin: notas_admin === '' ? 'Folio asignado al agendar.' : notas_admin
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Error al guardar los datos.');
        }

        showAlert('Cita Actualizada', 'Los cambios en la cita y observaciones han sido guardados.', 'success');
        closeModal('editModal');
        await loadAppointmentsData();
      } catch (error) {
        showAlert('Error de Guardado', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // --- LOGICA DE MODAL: REAGENDAR / MODIFICAR FECHA Y HORA ---
    function openRescheduleModal(appointment) {
      document.getElementById('rescheduleCitaId').value = appointment.id;
      document.getElementById('rescheduleCitizenName').textContent = appointment.nombre;
      document.getElementById('rescheduleCitaActual').textContent = `Folio: ${appointment.folio} | Fecha: ${formatShortDate(appointment.fecha)} | Horario: ${appointment.hora}`;
      
      document.getElementById('rescheduleFecha').value = '';
      document.getElementById('selectedRescheduleSlot').value = '';
      
      const slotsContainer = document.getElementById('rescheduleSlotsList');
      slotsContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); font-style: italic; font-size: 0.8rem;">Seleccione una fecha de miércoles primero...</div>`;
      
      document.getElementById('rescheduleNotas').value = `Reprogramación de cita Folio ${appointment.folio}`;

      openModal('rescheduleModal');
    }

    // Cargar horarios ocupados para la nueva fecha de reagendamiento
    async function loadAvailableSlotsForReschedule() {
      const fechaVal = document.getElementById('rescheduleFecha').value;
      const slotsContainer = document.getElementById('rescheduleSlotsList');
      const citaId = document.getElementById('rescheduleCitaId').value;
      
      if (!fechaVal) return;

      slotsContainer.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--primary);"><div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto 0.5rem auto;"></div>Consultando horarios...</div>';

      try {
        const response = await fetch(`/api/citas-ocupadas?fecha=${fechaVal}`);
        if (!response.ok) {
          throw new Error('Error al obtener horarios ocupados.');
        }

        const occupiedSlots = await response.json();
        
        const currentCita = allAppointments.find(app => String(app.id) === String(citaId));
        
        slotsContainer.innerHTML = '';
        
        let availableCount = 0;
        
        TIME_SLOTS.forEach(slot => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'modal-slot-btn';
          btn.textContent = slot.split(' - ')[0];
          btn.setAttribute('data-slot', slot);
          
          const isOccupiedByOther = occupiedSlots.includes(slot);
          const isCurrentSlot = currentCita && currentCita.fecha === fechaVal && currentCita.hora === slot;

          if (isOccupiedByOther && !isCurrentSlot) {
            btn.disabled = true;
            btn.title = "Horario ocupado";
          } else {
            availableCount++;
            if (isCurrentSlot) {
              btn.classList.add('selected');
              document.getElementById('selectedRescheduleSlot').value = slot;
              btn.title = "Horario actual de esta cita";
            }
            btn.onclick = () => selectRescheduleSlot(btn, slot);
          }
          
          slotsContainer.appendChild(btn);
        });

        if (availableCount === 0) {
          slotsContainer.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: var(--error); font-weight: 600; font-size: 0.8rem;">⚠️ Sin horarios disponibles para esta fecha. Límite de 15 citas alcanzado.</div>';
        }

      } catch (error) {
        slotsContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--error); font-size: 0.8rem;">${error.message}</div>`;
      }
    }

    function selectRescheduleSlot(btnElement, slot) {
      const buttons = document.querySelectorAll('.modal-slot-btn');
      buttons.forEach(btn => btn.classList.remove('selected'));
      
      btnElement.classList.add('selected');
      document.getElementById('selectedRescheduleSlot').value = slot;
    }

    async function saveCitaReschedule() {
      const id = document.getElementById('rescheduleCitaId').value;
      const fecha = document.getElementById('rescheduleFecha').value;
      const hora = document.getElementById('selectedRescheduleSlot').value;
      const notas_admin = document.getElementById('rescheduleNotas').value.trim();

      if (!fecha) {
        showAlert('Campo Requerido', 'Por favor seleccione la fecha del miércoles.', 'error');
        return;
      }

      if (!hora) {
        showAlert('Campo Requerido', 'Por favor seleccione un horario disponible.', 'error');
        return;
      }

      showLoading(true);
      try {
        const response = await fetchWithAuth(`/api/citas/${id}/reagendar`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fecha,
            hora,
            notas_admin: notas_admin === "" ? 'Cita reagendada por administración.' : notas_admin
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Error al reprogramar la cita.');
        }

        showAlert('Cita Reagendada', `Se ha reprogramado la cita exitosamente al miércoles ${formatShortDate(fecha)} en el horario ${hora}.`, 'success');
        closeModal('rescheduleModal');
        await loadAppointmentsData();
      } catch (error) {
        showAlert('Error de Guardado', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // --- LOGICA DE EXPORTACIÓN A PDF PARA IMPRIMIR ---
    function exportWednesdayPDF() {
      if (!currentWednesday) return;
      
      const formattedDate = formatDateString(currentWednesday);
      
      const dayAppointments = allAppointments.filter(app => app.fecha === formattedDate && app.estado !== 'cancelada');
      
      if (dayAppointments.length === 0) {
        showAlert('Exportar PDF', 'No hay citas activas registradas para este miércoles para exportar.', 'warning');
        return;
      }

      dayAppointments.sort((a, b) => a.hora.localeCompare(b.hora));

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF('p', 'mm', 'a4');
      
      const pColor = [15, 76, 58]; 
      const sColor = [185, 147, 38]; 

      doc.setFillColor(pColor[0], pColor[1], pColor[2]);
      doc.rect(0, 0, 210, 38, 'F'); 
      
      doc.setDrawColor(sColor[0], sColor[1], sColor[2]);
      doc.setLineWidth(1.5);
      doc.line(0, 38, 210, 38); 

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text("MIÉRCOLES CIUDADANO", 105, 14, { align: 'center' });
      
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(229, 193, 88); 
      doc.text("H. AYUNTAMIENTO CONSTITUCIONAL DE SAN FERNANDO, CHIAPAS", 105, 20, { align: 'center' });
      doc.text("DIRECCIÓN DE ATENCIÓN CIUDADANA", 105, 25, { align: 'center' });

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      
      const meses = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
      ];
      const dateText = `LISTA DE AUDIENCIAS: MIÉRCOLES, ${currentWednesday.getDate()} DE ${meses[currentWednesday.getMonth()].toUpperCase()} DE ${currentWednesday.getFullYear()}`;
      doc.text(dateText, 105, 33, { align: 'center' });

      doc.setTextColor(45, 55, 72);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Total de audiencias programadas para hoy: ${dayAppointments.length} de 15 máximo.`, 15, 46);
      doc.text(`Generado el: ${new Date().toLocaleDateString('es-MX')} ${new Date().toLocaleTimeString('es-MX')}`, 195, 46, { align: 'right' });

      const tableData = [];
      dayAppointments.forEach((app, idx) => {
        tableData.push([
          idx + 1,
          app.hora.split(' - ')[0],
          app.folio,
          app.nombre,
          app.colonia,
          app.motivo,
          '' 
        ]);
      });

      doc.autoTable({
        startY: 50,
        head: [['N°', 'Hora', 'Folio', 'Ciudadano', 'Colonia', 'Asunto / Motivo de Solicitud', 'Firma de Conformidad / Notas']],
        body: tableData,
        theme: 'grid',
        headStyles: {
          fillColor: pColor,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 8,
          halign: 'center',
          valign: 'middle'
        },
        columnStyles: {
          0: { cellWidth: 8, halign: 'center' }, 
          1: { cellWidth: 16, halign: 'center', fontStyle: 'bold' }, 
          2: { cellWidth: 18, halign: 'center', fontStyle: 'bold' }, 
          3: { cellWidth: 42, fontSize: 8.5 }, 
          4: { cellWidth: 32, fontSize: 8 }, 
          5: { cellWidth: 48, fontSize: 8.5 }, 
          6: { cellWidth: 26 } 
        },
        styles: {
          fontSize: 8,
          cellPadding: 2,
          valign: 'middle',
          overflow: 'linebreak'
        },
        alternateRowStyles: {
          fillColor: [247, 250, 252]
        },
        margin: { left: 10, right: 10 },
        didDrawPage: function(data) {
          doc.setFontSize(8);
          doc.setTextColor(113, 128, 150);
          doc.text("Ayuntamiento Municipal: Calle Central Oriente #1, Col. Centro, San Fernando, Chiapas", 105, 287, { align: 'center' });
          doc.text(`Página ${data.pageNumber} de ${doc.internal.getNumberOfPages()}`, 195, 287, { align: 'right' });
        }
      });

      const fileName = `MiercolesCiudadano_Lista_${formattedDate}.pdf`;
      doc.save(fileName);
      showAlert('PDF Exportado', `Se ha generado el archivo ${fileName} listo para imprimir.`, 'success');
    }


    // --- LÓGICA DE FECHAS BLOQUEADAS ---
    let allBlockedDates = [];

    // Cargar y mostrar la lista de fechas bloqueadas
    async function loadBlockedDates() {
      const tableBody = document.getElementById('blockedDatesTableBody');
      tableBody.innerHTML = "<tr><td colspan='4' style='text-align:center;'>Cargando fechas bloqueadas...</td></tr>";

      try {
        const response = await fetchWithAuth('/api/fechas-bloqueadas');
        if (!response.ok) {
          throw new Error('Error al obtener la lista de fechas bloqueadas.');
        }

        allBlockedDates = await response.json();
        tableBody.innerHTML = "";

        if (allBlockedDates.length === 0) {
          tableBody.innerHTML = "<tr><td colspan='4' style='text-align:center; color: var(--text-muted); font-style: italic;'>No hay fechas bloqueadas actualmente.</td></tr>";
          return;
        }

        allBlockedDates.forEach(item => {
          const row = document.createElement('tr');
          
          // Formatear la fecha
          const parts = item.fecha.split('-');
          const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
          const dayName = "Miércoles"; // Dado que sólo se pueden bloquear miércoles

          row.innerHTML = `
            <td><strong>${formatShortDate(item.fecha)}</strong></td>
            <td>${dayName}</td>
            <td>${escapeHtml(item.motivo)}</td>
            <td style="text-align: center;">
              <button onclick="deleteBlockedDate(${item.id}, '${item.fecha}')" class="btn btn-sm btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">
                Eliminar
              </button>
            </td>
          `;
          tableBody.appendChild(row);
        });
      } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan='4' style='text-align:center; color:var(--error);'>Error: ${error.message}</td></tr>`;
      }
    }

    // Agregar fecha bloqueada
    async function handleBlockedDateSubmit(event) {
      event.preventDefault();
      
      const fechaVal = document.getElementById('blockedDateInput').value;
      const motivoVal = document.getElementById('blockedReason').value.trim();

      if (!fechaVal || !motivoVal) {
        showAlert('Datos incompletos', 'Por favor selecciona una fecha y proporciona un motivo.', 'warning');
        return;
      }

      showLoading(true);

      try {
        const response = await fetchWithAuth('/api/fechas-bloqueadas', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            fecha: fechaVal,
            motivo: motivoVal
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Error al bloquear la fecha.');
        }

        showAlert('Fecha Bloqueada', `La fecha ${formatShortDate(fechaVal)} ha sido bloqueada correctamente.`, 'success');
        document.getElementById('blockedDateForm').reset();
        
        // Recargar la lista
        await loadBlockedDates();
      } catch (error) {
        showAlert('Error de Guardado', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // Eliminar bloqueo de fecha
    async function deleteBlockedDate(id, fecha) {
      if (!confirm(`¿Está seguro de que desea desbloquear la fecha ${formatShortDate(fecha)}?`)) {
        return;
      }

      showLoading(true);

      try {
        const response = await fetchWithAuth(`/api/fechas-bloqueadas/${id}`, {
          method: 'DELETE'
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Error al desbloquear la fecha.');
        }

        showAlert('Fecha Desbloqueada', `La fecha ${formatShortDate(fecha)} ha sido desbloqueada.`, 'success');
        await loadBlockedDates();
      } catch (error) {
        showAlert('Error al Eliminar', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // --- LÓGICA DE GESTIÓN DE ADMINISTRADORES ---
    let allAdmins = [];

    // Cargar y mostrar la lista de administradores
    async function loadAdmins() {
      const tableBody = document.getElementById('adminsTableBody');
      if (!tableBody) return;
      tableBody.innerHTML = "<tr><td colspan='3' style='text-align:center;'>Cargando administradores...</td></tr>";

      try {
        const response = await fetchWithAuth('/api/admins');
        if (!response.ok) {
          throw new Error('Error al obtener la lista de administradores.');
        }

        allAdmins = await response.json();
        tableBody.innerHTML = "";

        if (allAdmins.length === 0) {
          tableBody.innerHTML = "<tr><td colspan='3' style='text-align:center; color: var(--text-muted); font-style: italic;'>No hay administradores registrados.</td></tr>";
          return;
        }

        allAdmins.forEach(item => {
          const row = document.createElement('tr');
          const isSuper = (item.id === 1 || item.usuario.toLowerCase() === 'superadmin');
          const actionCell = isSuper 
            ? `<span class="badge badge-confirmada" style="padding: 0.25rem 0.6rem; font-size: 0.75rem;">Protegido (Superadmin)</span>`
            : `<button onclick="deleteAdminUser(${item.id}, '${escapeHtml(item.usuario)}')" class="btn btn-sm btn-danger" style="padding: 0.3rem 0.6rem; font-size: 0.75rem;">Eliminar</button>`;

          row.innerHTML = `
            <td>#${item.id}</td>
            <td><strong>${escapeHtml(item.usuario)}</strong> ${isSuper ? '<span style="font-size:0.75rem; color:var(--primary); font-weight:700; margin-left:0.25rem;">(Superadmin)</span>' : ''}</td>
            <td style="text-align: center;">${actionCell}</td>
          `;
          tableBody.appendChild(row);
        });
      } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan='3' style='text-align:center; color:var(--error);'>Error: ${error.message}</td></tr>`;
      }
    }

    // Crear un nuevo administrador
    async function handleCreateAdmin(event) {
      event.preventDefault();
      
      const userVal = document.getElementById('newAdminUser').value.trim();
      const passVal = document.getElementById('newAdminPassword').value;

      if (!userVal || !passVal) {
        showAlert('Datos incompletos', 'Por favor proporciona usuario y contraseña.', 'warning');
        return;
      }

      showLoading(true);

      try {
        const response = await fetchWithAuth('/api/admins', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            usuario: userVal,
            password: passVal
          })
        });

        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || 'Error al registrar administrador.');
        }

        showAlert('Administrador Creado', `El usuario "${userVal}" ha sido registrado correctamente.`, 'success');
        document.getElementById('newAdminForm').reset();
        
        await loadAdmins();
      } catch (error) {
        showAlert('Error de Registro', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // Eliminar cuenta de administrador
    async function deleteAdminUser(id, usuario) {
      if (!confirm(`¿Está seguro de que desea eliminar la cuenta del administrador "${usuario}"?`)) {
        return;
      }

      showLoading(true);

      try {
        const response = await fetchWithAuth(`/api/admins/${id}`, {
          method: 'DELETE'
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Error al eliminar administrador.');
        }

        showAlert('Administrador Eliminado', `El usuario "${usuario}" ha sido eliminado.`, 'success');
        await loadAdmins();
      } catch (error) {
        showAlert('Error al Eliminar', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // Reenviar correo de confirmación de cita al ciudadano
    async function resendConfirmationEmail(id) {
      if (!confirm('¿Está seguro de que desea reenviar el correo de confirmación de esta cita al ciudadano?')) {
        return;
      }

      showLoading(true);

      try {
        const response = await fetchWithAuth(`/api/citas/${id}/reenviar-correo`, {
          method: 'POST'
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Error al reenviar el correo.');
        }

        showAlert('Correo Enviado', data.message || 'El correo de confirmación ha sido reenviado correctamente.', 'success');
      } catch (error) {
        console.error(error);
        showAlert('Error de Correo', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // --- AUXILIARES GENERALES ---
    function openModal(modalId) {
      document.getElementById(modalId).classList.add('show');
    }

    function closeModal(modalId) {
      document.getElementById(modalId).classList.remove('show');
    }

    // Cambiar contraseña del administrador
    async function changeAdminPassword(event) {
      event.preventDefault();

      const currentPassword = document.getElementById('currentPasswordInput').value;
      const newPassword = document.getElementById('newPasswordInput').value;
      const confirmPassword = document.getElementById('confirmPasswordInput').value;

      if (newPassword !== confirmPassword) {
        showAlert('Error de Validación', 'La nueva contraseña y la confirmación no coinciden.', 'warning');
        return;
      }

      showLoading(true);

      try {
        const response = await fetchWithAuth('/api/admin/cambiar-password', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ currentPassword, newPassword })
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Error al cambiar la contraseña.');
        }

        showAlert('Contraseña Actualizada', 'La contraseña de administración se ha actualizado con éxito.', 'success');
        document.getElementById('changePasswordForm').reset();
        closeModal('changePasswordModal');
      } catch (error) {
        showAlert('Error al Cambiar Contraseña', error.message, 'error');
      } finally {
        showLoading(false);
      }
    }

    // Escapar caracteres HTML para seguridad
    function escapeHtml(text) {
      if (!text) return "";
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return text.replace(/[&<>"']/g, function(m) { return map[m]; });
    }