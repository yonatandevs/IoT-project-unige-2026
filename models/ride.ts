export interface Ride {
    bikeId: string
    customerId: string
    date: Date
    duration: number
    distance: number
    route: { lng: number, lat: number }[]
}