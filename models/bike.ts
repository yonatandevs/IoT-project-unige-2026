export interface Bike {
    id: string
    status: "available" | "rented" | "broken"
    locked: boolean
    position: {
        lng: number
        lat: number
    }
    battery: number
    current_speed: number
    last_seen: Date
    sensor_status: any
}
