// jsgps.js
export const gps = {
    currentPos: { lat: null, lon: null },
    currentSpeed: 0,
    lastTrackedPos: null,
    currentWeatherLabel: "Inconnue",

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
                    this.currentPos = { lat: pos.coords.latitude, lon: pos.coords.longitude }; 
                    this.currentSpeed = pos.coords.speed || 0; 
                    
                    let accuracy = Math.round(pos.coords.accuracy);

                    if(gpsStatus) { 
                        gpsStatus.innerText = `📍 GPS Actif (${accuracy}m)`; 
                        gpsStatus.style.color = accuracy > 30 ? "#f39c12" : "#27ae60"; 
                    }
                    
                    if (this.lastTrackedPos) {
                        let linearD = parseFloat(this.calculateDistance(this.lastTrackedPos.lat, this.lastTrackedPos.lon, this.currentPos.lat, this.currentPos.lon));
                        let speedKmh = this.currentSpeed * 3.6;

                        if (linearD > 0.025 && linearD < 2.0 && accuracy <= 30 && (speedKmh > 5 || pos.coords.speed === null)) { 
                            let realD = await this.getRealDistance(this.lastTrackedPos.lat, this.lastTrackedPos.lon, this.currentPos.lat, this.currentPos.lon);
                            let d = parseFloat(realD);
                            
                            if (isNaN(d) || d > linearD * 1.5) {
                                d = linearD;
                            }

                            if (window.app && window.app.isTruckRunning) { 
                                window.app.liveTruckDistance += d; 
                                localStorage.setItem('liveTruckDist', window.app.liveTruckDistance); 
                                window.app.updateTruckChronoDisp(); 
                                window.app.renderKmStats(); 
                            }
                            if (window.app && window.app.isCarRunning) { 
                                window.app.liveCarDistance += d; 
                                localStorage.setItem('liveCarDist', window.app.liveCarDistance); 
                                window.app.updateCarChronoDisp(); 
                                window.app.renderKmStats(); 
                            }
                            this.lastTrackedPos = { lat: this.currentPos.lat, lon: this.currentPos.lon };
                        }
                    } else { 
                        if (accuracy <= 30) {
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
        if (!this.currentPos.lat) return;
        try {
            let res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${this.currentPos.lat}&longitude=${this.currentPos.lon}&current_weather=true`);
            let data = await res.json();
            let code = data.current_weather.weathercode;
            let wStatus = document.getElementById('weather-status');
            
            if(code === 0 || code === 1) {
                this.currentWeatherLabel = "Dégagée";
                if(wStatus) { wStatus.innerText = "☀️ Météo Dégagée"; wStatus.style.color = "#f39c12"; }
            } else if (code > 1 && code < 50) {
                this.currentWeatherLabel = "Nuageuse";
                if(wStatus) { wStatus.innerText = "☁️ Météo Nuageuse"; wStatus.style.color = "#bdc3c7"; }
            } else {
                this.currentWeatherLabel = "Pluie / Difficile";
                if(wStatus) { wStatus.innerText = "🌧️ Météo Difficile"; wStatus.style.color = "#3498db"; }
            }
        } catch(e) { 
            console.warn("Impossible de récupérer la météo locale."); 
            this.currentWeatherLabel = "Inconnue";
        }
    },

    // NOUVEAU : Fonction de Reverse Geocoding pour trouver l'adresse
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

    async getRealDistance(lat1, lon1, lat2, lon2) {
        if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
        try {
            const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`);
            const data = await response.json();
            if (data.routes && data.routes.length > 0) return (data.routes[0].distance / 1000).toFixed(3);
        } catch (e) { console.warn("Pas de réseau OSRM, fallback sur calcul basique"); }
        return this.calculateDistance(lat1, lon1, lat2, lon2);
    },

    initMap(mapId, currentHistory, mapType) {
        if(!document.getElementById(mapId)) return;
        let mapInstance = mapType === 'trucks' ? window.app.truckMap : window.app.carMap;
        if(mapInstance) { mapInstance.remove(); }
        
        let defaultPos = this.currentPos.lat ? [this.currentPos.lat, this.currentPos.lon] : [46.603354, 1.888334]; 
        mapInstance = L.map(mapId).setView(defaultPos, 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapInstance);
        
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
                if(!h.isEvent) heatData.push([h.lat, h.lon, 1]); // On ne fait pas chauffer la HeatMap pour une pause
                
                let iconStr;
                if (h.isEvent) {
                    iconStr = h.eventType.includes("Pause") ? "⏸️" : "▶️";
                } else {
                    // Nouvelles icônes intégrées à la carte
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
