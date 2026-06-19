export interface Bike {
    id: string
    current_ride: string
    status: "available" | "rented" | "broken"
    locked: boolean
    position: {
        lng: number
        lat: number
    }
    battery: number
    current_speed: number
    imu: {
        x: number
        y: number
        z: number
        dx: number
        dy: number
        dz: number
    }
    timestamp: Date
}
