// Test stand-in for the Workers `cloudflare:email` module.
export class EmailMessage {
    constructor(
        readonly from: string,
        readonly to: string,
        readonly raw: string,
    ) {}
}
