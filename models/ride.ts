export interface Ride {
    bikeId: string
    customerId: string
    start: Date
    end: Date
    distance: number
    route: { lng: number, lat: number }[]
}
