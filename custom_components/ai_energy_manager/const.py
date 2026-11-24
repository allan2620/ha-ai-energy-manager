DOMAIN = "ai_energy_manager"
DEFAULTS = {
 "grid": "sensor.p1_meter_power", "pv": "sensor.danfoss_tlx_pro_241202n272_grid_power_total",
 "hp_power": "sensor.hp_power_consumption", "room": "sensor.boiler_room_nilan_user_panel_temperature_t15",
 "outdoor": "sensor.hp_outdoor", "water": "sensor.hp_warm_water_1_top", "price": "sensor.energi_data_service",
 "weather": "sensor.custom_weather_forecast_daily", "hp": "climate.hp_room_temp_setpoint",
 "dhw": "climate.hp_extra_warm_water", "nilan": "climate.boiler_room_nilan_hvac",
 "normal": 20.0, "maximum": 22.0, "boost": 0.5, "start_w": 2500.0, "stop_w": 500.0,
 "cheap": 2.3, "water_min": 48.0, "export_positive": False,
 "room_verified": False, "write_heat": False, "write_water": False
}
