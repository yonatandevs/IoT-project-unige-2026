import { Bike } from "./bike"

export interface Ride {
    bikeId: string
    customerId: string
    start: Date
    end: Date
    distance: number
    sensor_readings: Bike[]
}
