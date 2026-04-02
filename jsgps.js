// jsgps.js
export const gps = {
    currentPos: { lat: null, lon: null, alt: null },
    currentSpeed: 0,
    lastTrackedPos: null,
    currentWeatherLabel: "Inconnue",
    isFetchingWeather: false,

    init() {
        this.startTracking();
        setTimeout(() => this.fetchWeather(), 2000);
        setInterval(() => this.fetchWeather(), 900000); 
    },

    startTracking() {
        const gpsStatus = document.getElementById('gps-status');
        if ("geolocation" in navigator) {
            navigator.geolocation.watchPosition(
                async (pos) => { 
                    this.currentPos = { 
                        lat: pos.coords.latitude, 
                        lon: pos.coords.longitude, 
                        alt: pos.coords.altitude ? Math.round(pos.coords.altitude) : null 
                    }; 
                    this.currentSpeed = pos.coords.speed || 0; 
                    
                    let accuracy = Math.round(pos.coords.accuracy);

                    if(gpsStatus) { 
                        gpsStatus.innerText = `📍 GPS Actif (${accuracy}m)`; 
                        gpsStatus.style.color = accuracy > 20 ? "#f39c12" : "#27ae60"; 
                    }
                    
                    if (this.lastTrackedPos) {
                        let linearD = parseFloat(this.calculateDistance(this.lastTrackedPos.lat, this.lastTrackedPos.lon, this.currentPos.lat, this.currentPos.lon));
                        let speedKmh = this.currentSpeed * 3.6;

                        if (linearD > 0.1 && linearD < 3.0 && accuracy <= 20 && (speedKmh > 5 || pos.coords.speed === null)) { 
                            let d = linearD;

                            if (window.app && window.app.isTruckRunning) { 
                                window.app.liveTruckDistance += d; 
                                window.app.globalTruckDistance += d; // Ajout au compteur Global
                                localStorage.setItem('liveTruckDist', window.app.liveTruckDistance); 
                                localStorage.setItem('globalTruckDistance', window.app.globalTruckDistance); 
                                window.app.updateTruckChronoDisp(); 
                                window.app.renderKmStats(); 
                            }
                            if (window.app && window.app.isCarRunning) { 
                                window.app.liveCarDistance += d; 
                                window.app.globalCarDistance += d; // Ajout au compteur Global
                                localStorage.setItem('liveCarDist', window.app.liveCarDistance); 
                                localStorage.setItem('globalCarDistance', window.app.globalCarDistance); 
                                window.app.updateCarChronoDisp(); 
                                window.app.renderKmStats(); 
                            }
                            this.lastTrackedPos = { lat: this.currentPos.lat, lon: this.currentPos.lon };
                        }
                    } else { 
                        if (accuracy <= 20) {
                            this.lastTrackedPos = { lat: this.currentPos.lat, lon: this.currentPos.lon }; 
                        }
                    }
                },
                (err) => { if(gpsStatus) { gpsStatus.innerText = "❌ GPS Désactivé"; gpsStatus.style.color = "#e74c3c"; } },
                { enableHighAccuracy: true, maximumAge: 2000, timeout: 5000 }
            );
        }
    },

    async fetchWeather() {
        if (!this.currentPos.lat) {
            let wStatus = document.getElementById('weather-status');
            if(wStatus) { wStatus.innerHTML = "❌ Position introuvable 🔄"; wStatus.style.color = "#e74c3c"; }
            return;
        }
        if (this.isFetchingWeather) return; // Anti-spam clic
        
        this.isFetchingWeather = true;
        let wStatus = document.getElementById('weather-status');
        if(wStatus) { wStatus.innerHTML = "⏳ Météo en cours..."; wStatus.style.color = "#bdc3c7"; }

        try {
            let res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${this.currentPos.lat}&longitude=${this.currentPos.lon}&current_weather=true`);
            if (!res.ok) throw new Error("Erreur réseau");
            let data = await res.json();
            let code = data.current_weather.weathercode;
            
            if(code === 0 || code === 1) {
                this.currentWeatherLabel = "Dégagée";
                if(wStatus) { wStatus.innerHTML = "☀️ Météo Dégagée 🔄"; wStatus.style.color = "#f39c12"; }
            } else if (code > 1 && code < 50) {
                this.currentWeatherLabel = "Nuageuse";
                if(wStatus) { wStatus.innerHTML = "☁️ Météo Nuageuse 🔄"; wStatus.style.color = "#bdc3c7"; }
            } else {
                this.currentWeatherLabel = "Pluie / Difficile";
                if(wStatus) { wStatus.innerHTML = "🌧️ Météo Difficile 🔄"; wStatus.style.color = "#3498db"; }
            }
        } catch(e) { 
            console.warn("Impossible de récupérer la météo locale."); 
            this.currentWeatherLabel = "Inconnue";
            if(wStatus) { wStatus.innerHTML = "❌ Météo Inconnue 🔄"; wStatus.style.color = "#e74c3c"; }
        } finally {
            this.isFetchingWeather = false;
        }
    },

    async getAddress(lat, lon) {
        if (!lat || !lon) return "Position inconnue";
        try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`);
            const data = await response.json();
            if (data && data.address) {
                let city = data.address.city || data.address.town || data.address.village || data.address.municipality || "";
                let road = data.address.road || "";
                if (road && city) return `${road}, ${city}`;
                if (city) return city;
                if (road) return road;
                return data.display_name.split(',').slice(0, 2).join(', ');
            }
            return "Adresse introuvable";
        } catch (e) {
            console.warn("Erreur Reverse Geocoding", e);
            return "Position inconnue";
        }
    },

    calculateDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
        const R = 6371; 
        const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
        return (R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)))).toFixed(3); 
    },

    initMap(mapId, currentHistory, mapType) {
        if(!document.getElementById(mapId)) return;
        let mapInstance = mapType === 'trucks' ? window.app.truckMap : window.app.carMap;
        if(mapInstance) { mapInstance.remove(); }
        
        let defaultPos = this.currentPos.lat ? [this.currentPos.lat, this.currentPos.lon] : [46.603354, 1.888334]; 
        mapInstance = L.map(mapId).setView(defaultPos, 6);
        
        // Mode nuit pour la carte si le Dark Mode est activé
        let isDark = document.body.classList.contains('dark-mode');
        let tileUrl = isDark 
            ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' 
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        
        L.tileLayer(tileUrl).addTo(mapInstance);
        
        let latlngs = []; 
        let heatData = []; 
        
        let sessions = []; try { sessions = JSON.parse(localStorage.getItem(mapType === 'trucks' ? 'truckSessions' : 'carSessions')) || []; } catch(e){}
        sessions.forEach(s => {
            if(s.history) { 
                s.history.forEach(h => { 
                    if(h.lat && h.lon && !h.isEvent) heatData.push([h.lat, h.lon, 0.5]); 
                }); 
            }
        });

        currentHistory.forEach(h => {
            if(h.lat && h.lon) {
                latlngs.push([h.lat, h.lon]); 
                if(!h.isEvent) heatData.push([h.lat, h.lon, 1]); 
                
                let iconStr;
                if (h.isEvent) {
                    iconStr = h.eventType.includes("Pause") ? "⏸️" : "▶️";
                } else {
                    if (h.brand) iconStr = "🚛";
                    else if (h.type === "Motos") iconStr = "🏍️";
                    else if (h.type === "Vélos") iconStr = "🚲";
                    else if (h.type === "Engins agricoles") iconStr = "🚜";
                    else if (h.type === "Bus/Car") iconStr = "🚌";
                    else if (h.type === "Utilitaires") iconStr = "🚐";
                    else if (h.type === "Camping-cars") iconStr = "🏕️";
                    else iconStr = "🚗";
                }
                
                let markerHtml = `<div style="font-size: ${h.isEvent ? '16px' : '20px'}; opacity: ${h.isEvent ? '0.8' : '1'};">${iconStr}</div>`;
                let customIcon = L.divIcon({className: 'custom-icon', html: markerHtml, iconSize: [30, 30]});
                L.marker([h.lat, h.lon], {icon: customIcon}).addTo(mapInstance);
            }
        });

        if(latlngs.length > 1) {
            L.polyline(latlngs, {color: '#e74c3c', weight: 3}).addTo(mapInstance);
            mapInstance.fitBounds(L.polyline(latlngs).getBounds());
        } else if (heatData.length > 0) {
            mapInstance.fitBounds(L.latLngBounds(heatData.map(h => [h[0], h[1]])));
        }

        if (typeof L.heatLayer !== 'undefined' && heatData.length > 0) {
            L.heatLayer(heatData, {radius: 20, blur: 15, maxZoom: 10, minOpacity: 0.4}).addTo(mapInstance);
        }

        setTimeout(() => { mapInstance.invalidateSize(); }, 200);
        
        if (mapType === 'trucks') window.app.truckMap = mapInstance;
        else window.app.carMap = mapInstance;
    }
};
