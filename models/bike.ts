export interface Bike {
    id: string
    status: "available" | "rented" | "broken"
    position: {
        lng: number
        lat: number
    }
    battery: number
    charging_status: "charging" | "not_charging"
    current_speed: number
}