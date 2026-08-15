// --- FUNCIÓN DE SEGURIDAD PARA PREVENCIÓN DE XSS ---
    function escapeHtml(text) {
      if (!text) return "";
      const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
      };
      return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
    }

    // --- ESTADO GLOBAL DE LA APLICACIÓN ---
    let currentStep = 1;
    let selectedDate = "";
    let selectedTime = "";
    let citizenData = null;
    let dbAppointments = [];

    // --- CONFIGURACIÓN DE LOS HORARIOS (bloques de 20 minutos de 8am a 3pm) ---
    const TIME_SLOTS = [
      "08:00 - 08:20", "08:20 - 08:40", "08:40 - 09:00",
      "09:00 - 09:20", "09:20 - 09:40", "09:40 - 10:00",
      "10:00 - 10:20", "10:20 - 10:40", "10:40 - 11:00",
      "11:00 - 11:20", "11:20 - 11:40", "11:40 - 12:00",
      "12:00 - 12:20", "12:20 - 12:40", "12:40 - 13:00",
      "13:00 - 13:20", "13:20 - 13:40", "13:40 - 14:00",
      "14:00 - 14:20", "14:20 - 14:40", "14:40 - 15:00",

      
    ];

    // --- INICIALIZACIÓN ---
    document.addEventListener("DOMContentLoaded", () => {
      // Generar próximos 6 miércoles en el dropdown de agendado
      generateWednesdayOptions();
      
      // Generar miércoles en el dropdown del filtro de administración
      generateAdminWednesdayFilters();

      // Configurar SPA router básico al hacer click en los links de navegación
      const navLinks = document.querySelectorAll(".nav-link");
      navLinks.forEach(link => {
        link.addEventListener("click", (e) => {
          const sectionId = link.getAttribute("data-section");
          if (sectionId) {
            e.preventDefault();
            navigateToSection(sectionId);
          }
        });
      });

      // Configurar Toggle de Menú Móvil
      const mobileBtn = document.getElementById("mobileMenuBtn");
      const navMenu = document.getElementById("navMenu");
      mobileBtn.addEventListener("click", () => {
        navMenu.classList.toggle("mobile-active");
      });

      // Parsear parámetros de consulta (?fecha=...&hora=...) para precarga
      const urlParams = new URLSearchParams(window.location.search);
      const urlFecha = urlParams.get('fecha');
      const urlHora = urlParams.get('hora');
      
      if (urlFecha && urlHora) {
        selectedDate = urlFecha;
        selectedTime = urlHora;
        
        // Colocar la fecha en el selector del Paso 2
        const dateSelect = document.getElementById("appointmentDate");
        if (dateSelect) {
          // Si la fecha no está entre las opciones del select, la agregamos dinámicamente
          const optionExists = Array.from(dateSelect.options).some(opt => opt.value === urlFecha);
          if (!optionExists) {
            const option = document.createElement("option");
            option.value = urlFecha;
            option.textContent = formatDateText(urlFecha);
            dateSelect.appendChild(option);
          }
          dateSelect.value = urlFecha;
        }
        
        // Ir a la sección de agendar cita de inmediato
        navigateToSection("agendar");
      } else if (window.location.hash) {
        const hash = window.location.hash.substring(1);
        if (["inicio", "agendar", "consultar", "administracion"].includes(hash)) {
          navigateToSection(hash);
        }
      }
      
      // Verificar si hay sesión de admin activa en sessionStorage
      if (sessionStorage.getItem("adminLoggedIn") === "true") {
        showAdminDashboard();
      }
    });

    // --- NAVEGACIÓN SPA (Single Page Application) ---
    function navigateToSection(sectionId) {
      // Cerrar menú móvil por si estaba abierto
      document.getElementById("navMenu").classList.remove("mobile-active");

      // Ocultar todas las secciones
      const sections = document.querySelectorAll(".app-section");
      sections.forEach(s => s.classList.remove("active"));

      // Mostrar la sección correspondiente
      const targetSection = document.getElementById(sectionId);
      if (targetSection) {
        targetSection.classList.add("active");
        
        // Actualizar URL hash de forma limpia
        history.pushState(null, null, `#${sectionId}`);
      }

      // Actualizar estados activos de los enlaces del navbar
      const navLinks = document.querySelectorAll(".nav-link");
      navLinks.forEach(link => {
        if (link.getAttribute("data-section") === sectionId) {
          link.classList.add("active");
        } else {
          link.classList.remove("active");
        }
      });

      // Si se navega a la sección de administración y ya está autenticado, actualizar la tabla
      if (sectionId === "administracion" && sessionStorage.getItem("adminLoggedIn") === "true") {
        updateAdminTable();
      }
      
      // Hacer scroll hacia arriba
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Escuchar cambios de historial en el navegador (atrás/adelante)
    window.addEventListener("popstate", () => {
      const hash = window.location.hash.substring(1) || "inicio";
      if (["inicio", "agendar", "consultar", "administracion"].includes(hash)) {
        navigateToSection(hash);
      }
    });

    // --- DATES Y CALENDARIO DILIGENCIAS (SOLO MIÉRCOLES) ---
    function getNextWednesdays(count) {
      const dates = [];
      const today = new Date();
      
      // Buscar el primer miércoles a partir de hoy
      let current = new Date(today);
      let daysUntilWednesday = (3 - current.getDay() + 7) % 7;
      
      // Si hoy es miércoles, pero ya pasó el horario (después de la 1:00 PM), saltamos al siguiente
      if (daysUntilWednesday === 0 && today.getHours() >= 13) {
        daysUntilWednesday = 7;
      }
      
      current.setDate(current.getDate() + daysUntilWednesday);
      
      const meses = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
      ];
      
      for (let i = 0; i < count; i++) {
        const d = new Date(current);
        const day = d.getDate();
        const month = meses[d.getMonth()];
        const year = d.getFullYear();
        // Usamos valores locales para evitar el desfase de zona horaria de toISOString() (que usa UTC)
        const isoString = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        dates.push({
          iso: isoString,
          formatted: `Miércoles ${day} de ${month}, ${year}`,
          shortFormatted: `${day}/${d.getMonth()+1}/${year}`
        });
        
        current.setDate(current.getDate() + 7);
      }
      return dates;
    }

    // Rellena la lista desplegable de fechas del formulario (filtrando las bloqueadas)
    async function generateWednesdayOptions() {
      const select = document.getElementById("appointmentDate");
      select.innerHTML = '<option value="" disabled selected>-- Selecciona un miércoles --</option>';
      
      try {
        const response = await fetch('/api/fechas-bloqueadas');
        let blockedDates = [];
        if (response.ok) {
          const blockedData = await response.json();
          blockedDates = blockedData.map(item => item.fecha);
        }
        
        const wednesdays = getNextWednesdays(4); // Mostrar los próximos 4 miércoles
        const availableWednesdays = wednesdays.filter(wed => !blockedDates.includes(wed.iso));
        
        if (availableWednesdays.length === 0) {
          select.innerHTML = '<option value="" disabled selected>-- No hay miércoles disponibles próximamente --</option>';
          return;
        }

        availableWednesdays.forEach(wed => {
          const option = document.createElement("option");
          option.value = wed.iso;
          option.textContent = wed.formatted;
          select.appendChild(option);
        });
      } catch (error) {
        console.error("Error al obtener fechas bloqueadas:", error);
        // Fallback en caso de error
        const wednesdays = getNextWednesdays(4);
        wednesdays.forEach(wed => {
          const option = document.createElement("option");
          option.value = wed.iso;
          option.textContent = wed.formatted;
          select.appendChild(option);
        });
      }
    }

    // Rellena la lista desplegable de fechas del panel de administración
    function generateAdminWednesdayFilters() {
      const select = document.getElementById("adminFilterDate");
      select.innerHTML = '<option value="">Todas las fechas</option>';
      
      const wednesdays = getNextWednesdays(4); // Mostrar los mismos próximos 4 miércoles
      wednesdays.forEach(wed => {
        const option = document.createElement("option");
        option.value = wed.iso;
        option.textContent = wed.formatted;
        select.appendChild(option);
      });
    }

    // --- PASOS DEL REGISTRO Y RESERVACIÓN (PASO 1 -> PASO 2 -> PASO 3) ---
    function goToStep(step) {
      currentStep = step;
      const mainTitle = document.getElementById("bookingMainTitle");
      const subTitle = document.getElementById("bookingSubTitle");
      
      if (step === 1) {
        mainTitle.textContent = "Agendar Cita";
        subTitle.textContent = "Paso 1 de 3: Registro de Ciudadano";
        
        document.getElementById("dotStep1").className = "step-dot active";
        document.getElementById("dotStep2").className = "step-dot";
        document.getElementById("dotStep3").className = "step-dot";
        
        document.getElementById("step1Content").classList.add("active");
        document.getElementById("step2Content").classList.remove("active");
        document.getElementById("step3Content").classList.remove("active");
      } 
      else if (step === 2) {
        mainTitle.textContent = "Programar Audiencia";
        subTitle.textContent = "Paso 2 de 3: Fecha, Horario y Motivo";
        
        document.getElementById("dotStep1").className = "step-dot completed";
        document.getElementById("dotStep2").className = "step-dot active";
        document.getElementById("dotStep3").className = "step-dot";
        
        document.getElementById("step1Content").classList.remove("active");
        document.getElementById("step2Content").classList.add("active");
        document.getElementById("step3Content").classList.remove("active");
        
        const dateVal = document.getElementById("appointmentDate").value;
        if (dateVal) {
          handleDateSelect(dateVal);
        }
      } 
      else if (step === 3) {
        mainTitle.textContent = "¡Cita Confirmada!";
        subTitle.textContent = "Paso 3 de 3: Guardar tu Comprobante";
        
        document.getElementById("dotStep1").className = "step-dot completed";
        document.getElementById("dotStep2").className = "step-dot completed";
        document.getElementById("dotStep3").className = "step-dot active";
        
        document.getElementById("step1Content").classList.remove("active");
        document.getElementById("step2Content").classList.remove("active");
        document.getElementById("step3Content").classList.add("active");
      }
      
      document.querySelector('.booking-container').scrollIntoView({ behavior: 'smooth' });
    }

    // Mostrar/ocultar campo de texto si se selecciona "OTRO" en Colonias
    function handleColoniaChange(selectElem) {
      const customGroup = document.getElementById("customColoniaGroup");
      const customInput = document.getElementById("customColonia");
      
      if (selectElem.value === "OTRO") {
        customGroup.style.display = "flex";
        customInput.setAttribute("required", "required");
      } else {
        customGroup.style.display = "none";
        customInput.removeAttribute("required");
        customInput.value = "";
      }
    }

    // Paso 1: Enviar formulario del Ciudadano al Servidor API
    async function handleCitizenSubmit(event) {
      event.preventDefault();
      
      const fullName = document.getElementById("fullName").value.trim();
      const phone = document.getElementById("phone").value.trim();
      const email = document.getElementById("email").value.trim();
      const coloniaSelect = document.getElementById("colonia").value;
      const customColonia = document.getElementById("customColonia").value.trim();
      
      if (phone.length !== 10 || isNaN(phone)) {
        alert("El número de teléfono debe constar exactamente de 10 dígitos numéricos.");
        document.getElementById("phone").focus();
        return;
      }
      
      const submitBtn = event.target.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Registrando...";

      try {
        const response = await fetch('/api/registro', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            nombre: fullName,
            telefono: phone,
            correo: email,
            colonia: coloniaSelect === "OTRO" ? customColonia : coloniaSelect
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Error al registrar ciudadano');
        }

        // Guardar en estado temporal incluyendo el ID asignado por la BD
        citizenData = {
          id: data.citizen.id,
          fullName: data.citizen.nombre,
          phone: data.citizen.telefono,
          email: data.citizen.correo,
          colonia: data.citizen.colonia
        };
        
        goToStep(2);
      } catch (error) {
        alert("Error de registro: " + error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }

    // Paso 2: Selección de fecha (consultar horarios ocupados de forma real)
    async function handleDateSelect(dateVal) {
      // Si la fecha cambia y no coincide con la precargada, limpiamos la hora seleccionada
      const urlParams = new URLSearchParams(window.location.search);
      const urlFecha = urlParams.get('fecha');
      const urlHora = urlParams.get('hora');
      
      if (selectedDate !== dateVal || selectedTime === "") {
        selectedTime = "";
        document.getElementById("selectedTimeSlot").value = "";
      }
      
      selectedDate = dateVal;
      
      const grid = document.getElementById("timeSlotsGrid");
      grid.innerHTML = '<div style="color:var(--primary); font-weight:600; padding:10px;">Cargando horarios disponibles...</div>';
      
      try {
        const response = await fetch(`/api/citas-ocupadas?fecha=${dateVal}`);
        if (!response.ok) throw new Error('Error al cargar horarios del servidor.');
        
        const bookedTimes = await response.json();
        grid.innerHTML = ""; // Limpiar
        
        // Verificamos si debemos aplicar la precarga de hora
        let preloadHora = "";
        if (urlFecha === dateVal && urlHora) {
          preloadHora = urlHora;
        }
        
        TIME_SLOTS.forEach(slot => {
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "slot-btn";
          btn.textContent = slot.split(" - ")[0];
          btn.setAttribute("data-slot", slot);
          
          if (bookedTimes.includes(slot)) {
            btn.disabled = true;
          } else {
            btn.addEventListener("click", () => selectTimeSlot(btn, slot));
            if (preloadHora && preloadHora === slot) {
              btn.classList.add("selected");
              selectedTime = slot;
              document.getElementById("selectedTimeSlot").value = slot;
            }
          }
          grid.appendChild(btn);
        });
      } catch (error) {
        console.error(error);
        grid.innerHTML = '<div style="color:var(--error); font-weight:600; padding:10px;">Error al obtener horarios ocupados del servidor.</div>';
      }
    }

    // Al seleccionar un bloque de hora
    function selectTimeSlot(buttonElem, slot) {
      const buttons = document.querySelectorAll(".slot-btn");
      buttons.forEach(btn => btn.classList.remove("selected"));
      
      buttonElem.classList.add("selected");
      selectedTime = slot;
      document.getElementById("selectedTimeSlot").value = slot;
    }

    // Paso 2: Guardar Cita real en el servidor
    async function handleAppointmentSubmit(event) {
      event.preventDefault();
      
      const reason = document.getElementById("appointmentReason").value;
      
      if (!selectedDate) {
        alert("Debe seleccionar una fecha de miércoles disponible.");
        return;
      }
      
      if (!selectedTime) {
        alert("Debe elegir un horario disponible.");
        return;
      }
      
      if (!reason) {
        alert("Debe seleccionar el motivo/tema de la audiencia.");
        return;
      }

      const submitBtn = event.target.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Agendando...";

      try {
        const response = await fetch('/api/agendar-cita', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ciudadano_id: citizenData.id,
            fecha: selectedDate,
            hora: selectedTime,
            motivo: reason
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Error al programar la cita');
        }
        
        // Actualizar Ticket del Paso 3
        document.getElementById("ticketCode").textContent = data.appointment.folio;
        document.getElementById("ticketName").textContent = citizenData.fullName;
        document.getElementById("ticketPhone").textContent = citizenData.phone;
        document.getElementById("ticketDate").textContent = formatDateText(selectedDate);
        document.getElementById("ticketTime").textContent = selectedTime;
        document.getElementById("ticketReason").textContent = reason;
        document.getElementById("ticketColonia").textContent = citizenData.colonia;
        
        goToStep(3);
      } catch (error) {
        alert("Error al agendar cita: " + error.message);
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }

    // Consulta pública de cita por folio y contacto
    async function handleSearchAppointment(event) {
      event.preventDefault();
      
      const folio = document.getElementById("searchFolio").value.trim();
      const contact = document.getElementById("searchContact").value.trim();
      
      const submitBtn = event.target.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      
      // Limpiar áreas
      document.getElementById("searchResultArea").style.display = "none";
      document.getElementById("searchErrorArea").style.display = "none";
      
      if (!folio || !contact) {
        alert("Por favor rellene todos los campos obligatorios.");
        return;
      }
      
      submitBtn.disabled = true;
      submitBtn.textContent = "Buscando...";
      
      try {
        const response = await fetch(`/api/citas/consultar?folio=${encodeURIComponent(folio)}&contacto=${encodeURIComponent(contact)}`);
        const data = await response.json();
        
        if (!response.ok) {
          throw new Error(data.error || "No se encontró el registro.");
        }
        
        // Cargar datos en la UI
        document.getElementById("resultFolio").textContent = data.folio;
        document.getElementById("resultName").textContent = data.nombre;
        document.getElementById("resultDate").textContent = formatDateText(data.fecha);
        document.getElementById("resultTime").textContent = data.hora;
        document.getElementById("resultReason").textContent = data.motivo;
        
        // Poner estado
        const statusBadge = document.getElementById("resultStatus");
        statusBadge.textContent = data.estado.toUpperCase();
        
        // Limpiar clases de estado
        statusBadge.className = "badge";
        if (data.estado.toLowerCase() === 'confirmada') {
          statusBadge.style.backgroundColor = "var(--success)";
          statusBadge.style.color = "white";
        } else if (data.estado.toLowerCase() === 'cancelada') {
          statusBadge.style.backgroundColor = "var(--error)";
          statusBadge.style.color = "white";
        } else {
          statusBadge.style.backgroundColor = "var(--secondary)";
          statusBadge.style.color = "var(--primary-dark)";
        }
        
        // Notas
        document.getElementById("resultNotes").textContent = `"${data.notas_admin || 'Sin observaciones.'}"`;
        
        // Mostrar área de resultado
        document.getElementById("searchResultArea").style.display = "block";
      } catch (error) {
        console.error(error);
        const errorArea = document.getElementById("searchErrorArea");
        errorArea.textContent = error.message;
        errorArea.style.display = "block";
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    }

    // Formatea fecha YYYY-MM-DD a "Miércoles DD de Mes, YYYY"
    function formatDateText(dateString) {
      const parts = dateString.split("-");
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      
      const meses = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
      ];
      
      return `Miércoles, ${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
    }

    // Reinicia el flujo de citas para agendar otra
    function resetBookingForm() {
      document.getElementById("citizenForm").reset();
      document.getElementById("appointmentForm").reset();
      
      selectedDate = "";
      selectedTime = "";
      citizenData = null;
      
      document.getElementById("customColoniaGroup").style.display = "none";
      
      const grid = document.getElementById("timeSlotsGrid");
      grid.innerHTML = '<div class="no-date-selected-message">Por favor, selecciona una fecha primero para ver los horarios disponibles.</div>';
      
      goToStep(1);
    }

    // --- ACCESO ADMINISTRATIVO (LOGIN & LOGOUT POR API TOKEN) ---
    async function handleAdminLogin(event) {
      event.preventDefault();
      
      const password = document.getElementById("adminPassword").value;
      const errorMsg = document.getElementById("loginErrorMsg");
      
      const submitBtn = event.target.querySelector('button[type="submit"]');
      submitBtn.disabled = true;

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Contraseña incorrecta');
        }

        errorMsg.style.display = "none";
        document.getElementById("adminPassword").value = "";
        
        sessionStorage.setItem("adminLoggedIn", "true");
        sessionStorage.setItem("adminToken", data.token);
        
        showAdminDashboard();
      } catch (error) {
        errorMsg.textContent = error.message;
        errorMsg.style.display = "block";
        document.getElementById("adminPassword").focus();
      } finally {
        submitBtn.disabled = false;
      }
    }

    function showAdminDashboard() {
      document.getElementById("adminLoginView").style.display = "none";
      document.getElementById("adminDashboardView").style.display = "block";
      updateAdminTable();
    }

    function handleAdminLogout() {
      sessionStorage.removeItem("adminLoggedIn");
      sessionStorage.removeItem("adminToken");
      
      document.getElementById("adminDashboardView").style.display = "none";
      document.getElementById("adminLoginView").style.display = "block";
    }

    // --- FUNCIONALIDADES DE PANEL ADMINISTRATIVO ---
    function updateDashboardStats(appointments) {
      document.getElementById("statTotalCitas").textContent = appointments.length;
      
      const nextWeds = getNextWednesdays(1);
      const thisWednesday = nextWeds.length > 0 ? nextWeds[0].iso : "";
      const countThisWeek = appointments.filter(app => app.fecha === thisWednesday && app.estado !== 'cancelada').length;
      document.getElementById("statSemana").textContent = countThisWeek;
      
      const countServicios = appointments.filter(app => app.motivo === "Servicios Municipales" && app.estado !== 'cancelada').length;
      const countObra = appointments.filter(app => app.motivo === "Obra Pública" && app.estado !== 'cancelada').length;
      
      document.getElementById("statServicios").textContent = countServicios;
      document.getElementById("statObra").textContent = countObra;
    }

    // Actualiza la tabla del dashboard obteniendo los datos reales
    async function updateAdminTable() {
      const tableBody = document.getElementById("adminTableBody");
      tableBody.innerHTML = "<tr><td colspan='9' style='text-align:center;'>Cargando registros...</td></tr>";
      
      const token = sessionStorage.getItem("adminToken");
      if (!token) {
        handleAdminLogout();
        return;
      }

      try {
        const response = await fetch('/api/citas', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.status === 401 || response.status === 403) {
          handleAdminLogout();
          return;
        }

        if (!response.ok) throw new Error('Error al consultar citas.');
        
        dbAppointments = await response.json();
        const filtered = getFilteredAppointments();
        
        document.getElementById("adminTableCount").textContent = filtered.length;
        updateDashboardStats(dbAppointments);

        tableBody.innerHTML = "";

        if (filtered.length === 0) {
          const row = document.createElement("tr");
          row.innerHTML = `<td colspan="9" class="no-records">No se encontraron citas agendadas con los filtros seleccionados.</td>`;
          tableBody.appendChild(row);
          return;
        }

        filtered.sort((a, b) => {
          if (a.fecha !== b.fecha) {
            return a.fecha.localeCompare(b.fecha);
          }
          return a.hora.localeCompare(b.hora);
        });

        filtered.forEach(app => {
          const row = document.createElement("tr");
          
          let reasonClass = "reason-otro";
          if (app.motivo === "Obra Pública") reasonClass = "reason-obra";
          else if (app.motivo === "Seguridad") reasonClass = "reason-seguridad";
          else if (app.motivo === "Servicios Municipales") reasonClass = "reason-servicios";

          let statusClass = "status-pendiente";
          if (app.estado === "confirmada") statusClass = "status-confirmada";
          else if (app.estado === "cancelada") statusClass = "status-cancelada";

          row.innerHTML = `
            <td><strong style="color: var(--secondary-dark); font-size: 0.8rem;">${escapeHtml(app.folio)}</strong></td>
            <td><strong>${escapeHtml(app.nombre)}</strong></td>
            <td>${escapeHtml(app.telefono)}</td>
            <td>${escapeHtml(formatShortDate(app.fecha))}</td>
            <td><span style="font-weight:600;">${escapeHtml(app.hora.split(" - ")[0])}</span></td>
            <td>${escapeHtml(app.colonia)}</td>
            <td><span class="reason-pill ${reasonClass}">${escapeHtml(app.motivo)}</span></td>
            <td style="text-align: center;">
              <div class="table-actions" style="justify-content: center; gap: 0.3rem;">
                <select class="status-select ${statusClass}" onchange="openStatusModal(${app.id}, this.value)" style="border-radius: var(--radius-sm); border: 1px solid var(--border-color); padding: 4px; font-size: 0.8rem; font-weight: 600; cursor: pointer; outline: none;">
                  <option value="pendiente" ${app.estado === 'pendiente' ? 'selected' : ''}>Pendiente</option>
                  <option value="confirmada" ${app.estado === 'confirmada' ? 'selected' : ''}>Confirmada</option>
                  <option value="cancelada" ${app.estado === 'cancelada' ? 'selected' : ''}>Cancelada</option>
                </select>
                <button class="btn-icon btn-icon-delete" title="Cancelar Cita" onclick="deleteAppointment(${app.id}, '${escapeHtml(app.folio)}')">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                </button>
              </div>
            </td>
          `;
          tableBody.appendChild(row);
        });
      } catch (error) {
        console.error(error);
        tableBody.innerHTML = `<tr><td colspan='8' class='no-records' style='color:var(--error);'>Error al obtener registros del servidor.</td></tr>`;
      }
    }

    // Abrir modal para actualización de estado y notas
    let activeAppointmentId = null;
    let targetStatus = null;

    function openStatusModal(id, newStatus) {
      const app = dbAppointments.find(a => a.id === id);
      if (!app) return;

      activeAppointmentId = id;
      targetStatus = newStatus;

      document.getElementById("modalFolio").textContent = app.folio;
      document.getElementById("modalCiudadano").textContent = app.nombre;
      
      const statusBadge = document.getElementById("modalEstadoText");
      statusBadge.textContent = newStatus.toUpperCase();
      statusBadge.className = `badge badge-${newStatus.toLowerCase()}`;
      
      // Mostrar la nota actual si existe y no es la por defecto
      const defaultNotes = "Folio asignado al agendar.";
      const currentNotes = app.notas_admin && app.notas_admin !== defaultNotes ? app.notas_admin : "";
      document.getElementById("modalNotes").value = currentNotes;

      document.getElementById("statusModal").style.display = "flex";
    }

    function closeStatusModal() {
      document.getElementById("statusModal").style.display = "none";
      activeAppointmentId = null;
      targetStatus = null;
      updateAdminTable(); // Refrescar para restaurar los selects en caso de haber cancelado
    }

    async function saveAppointmentStatus() {
      if (!activeAppointmentId || !targetStatus) return;

      const token = sessionStorage.getItem("adminToken");
      if (!token) return handleAdminLogout();

      const notes = document.getElementById("modalNotes").value.trim();
      const saveBtn = document.getElementById("modalSaveBtn");
      const originalText = saveBtn.textContent;
      
      saveBtn.disabled = true;
      saveBtn.textContent = "Guardando...";

      try {
        const response = await fetch(`/api/citas/${activeAppointmentId}/estado`, {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ 
            estado: targetStatus,
            notas_admin: notes || "Folio asignado al agendar."
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Error al cambiar el estado');

        document.getElementById("statusModal").style.display = "none";
        activeAppointmentId = null;
        targetStatus = null;
        updateAdminTable();
      } catch (error) {
        alert("Error al actualizar estado: " + error.message);
        closeStatusModal();
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = originalText;
      }
    }

    // Filtra las citas en base a inputs de búsqueda
    function getFilteredAppointments() {
      const search = document.getElementById("adminSearch").value.toLowerCase().trim();
      const filterDate = document.getElementById("adminFilterDate").value;
      const filterReason = document.getElementById("adminFilterReason").value;
      
      return dbAppointments.filter(app => {
        const matchSearch = search === "" || 
                            app.nombre.toLowerCase().includes(search) || 
                            app.telefono.includes(search) ||
                            app.folio.toLowerCase().includes(search);
                            
        const matchDate = filterDate === "" || app.fecha === filterDate;
        const matchReason = filterReason === "" || app.motivo === filterReason;
        
        return matchSearch && matchDate && matchReason;
      });
    }

    // Callback para filtrar en tiempo real al escribir o seleccionar
    function filterAdminAppointments() {
      updateAdminTable();
    }

    // Cancelar Cita por ID de forma real
    async function deleteAppointment(id, folio) {
      if (confirm(`¿Está seguro de que desea cancelar la cita con folio ${folio}? Esta acción liberará el horario.`)) {
        const token = sessionStorage.getItem("adminToken");
        if (!token) return handleAdminLogout();

        try {
          const response = await fetch(`/api/citas/${id}/estado`, {
            method: 'PUT',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ estado: 'cancelada' })
          });

          const data = await response.json();
          if (!response.ok) throw new Error(data.error || 'Error al cancelar la cita');

          updateAdminTable();
        } catch (error) {
          alert("Error al cancelar cita: " + error.message);
        }
      }
    }

    // Formato corto de fecha DD/MM/AAAA
    function formatShortDate(dateString) {
      const parts = dateString.split("-");
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }



    // Exportar tabla a formato CSV
    function exportToCSV() {
      if (dbAppointments.length === 0) {
        alert("No hay citas registradas en el sistema para exportar.");
        return;
      }
      
      const filtered = getFilteredAppointments();
      if (filtered.length === 0) {
        alert("No hay registros que coincidan con tus filtros actuales para exportar.");
        return;
      }

      // Columnas del CSV
      let csvContent = "data:text/csv;charset=utf-8,";
      csvContent += "Folio,Ciudadano,Telefono,Correo,Colonia,Fecha_Cita,Horario,Motivo_Tema,Estado,Notas_Admin\n";
      
      filtered.forEach(app => {
        const cleanName = app.nombre.replace(/,/g, " ");
        const cleanColonia = app.colonia.replace(/,/g, " ");
        const cleanReason = app.motivo.replace(/,/g, " ");
        const cleanNotes = (app.notas_admin || "").replace(/,/g, " ");
        
        const row = [
          app.folio,
          `"${cleanName}"`,
          app.telefono,
          app.correo,
          `"${cleanColonia}"`,
          app.fecha,
          `"${app.hora}"`,
          `"${cleanReason}"`,
          app.estado,
          `"${cleanNotes}"`
        ].join(",");
        
        csvContent += row + "\n";
      });
      
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      
      const timestamp = new Date().toISOString().split('T')[0];
      link.setAttribute("download", `Citas_MiercolesCiudadano_Real_${timestamp}.csv`);
      document.body.appendChild(link);
      
      link.click();
      document.body.removeChild(link);
    }

    // --- LOCAL STORAGE (PERSISTENCIA LOCAL) ---
    function saveAppointmentsToStorage() {
      localStorage.setItem("san_fernando_appointments", JSON.stringify(dbAppointments));
    }

    function loadAppointmentsFromStorage() {
      const stored = localStorage.getItem("san_fernando_appointments");
      if (stored) {
        try {
          dbAppointments = JSON.parse(stored);
        } catch(e) {
          dbAppointments = [];
        }
      }
    }