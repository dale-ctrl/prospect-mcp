/**
 * TypeScript types for Prospect365 OData entities.
 * Derived from the $metadata endpoint.
 */
export interface Quote {
    QuoteId: number;
    ContactId: number | null;
    LeadId: number | null;
    DivisionId: number;
    StatusId: number;
    QuoteType: string;
    SalesPersonId: string | null;
    Description: string | null;
    OrderNumber: string | null;
    CustomerOrderReference: string | null;
    Memo: string | null;
    ProjectCode: string | null;
    Priority: number | null;
    Urgent: number | null;
    DeliveryName: string | null;
    DeliveryAddressLine1: string | null;
    DeliveryAddressLine2: string | null;
    DeliveryAddressLine3: string | null;
    DeliveryAddressLine4: string | null;
    DeliveryAddressLine5: string | null;
    DeliveryCountry: string | null;
    DeliveryPostcode: string | null;
    DeliveryNotes1: string | null;
    DeliveryNotes2: string | null;
    QuoteDate: string | null;
    OrderDate: string | null;
    OrderDueDate: string | null;
    Created: string | null;
    LastUpdated: string | null;
    DecimalHomeNetValue: number | null;
    DecimalHomeGrossValue: number | null;
    DecimalHomeCostValue: number | null;
    DecimalHomeTaxValue: number | null;
    MarginPercentage: number | null;
    MarkupPercentage: number | null;
    OverallDiscountPercentage: number | null;
    RecordLink: string | null;
    StatusFlag: string;
    Contact?: Contact;
    Division?: Division;
    Status?: QuoteStatus;
    SalesPerson?: User;
    QuoteLines?: QuoteLine[];
}
/** Fields accepted when creating a quote via POST */
export interface QuoteCreate {
    ContactId: number;
    Description?: string;
    SalesPersonId?: string;
    OrderNumber?: string;
    CustomerOrderReference?: string;
    OrderDueDate?: string;
    Memo?: string;
    ProjectCode?: string;
    Priority?: number;
    Urgent?: number;
    OverallDiscountPercentage?: number;
    DeliveryName?: string;
    DeliveryAddressLine1?: string;
    DeliveryAddressLine2?: string;
    DeliveryAddressLine3?: string;
    DeliveryAddressLine4?: string;
    DeliveryAddressLine5?: string;
    DeliveryCountry?: string;
    DeliveryPostcode?: string;
    DeliveryNotes1?: string;
    DeliveryNotes2?: string;
}
/** Fields accepted when updating a quote via PATCH */
export type QuoteUpdate = Partial<Omit<QuoteCreate, "ContactId">>;
export interface QuoteLine {
    LineId: number;
    QuoteId: number;
    ProductItemId: string | null;
    Description: string;
    ExtendedDescription: string | null;
    Sequence: number | null;
    TaxCode: string | null;
    GroupId: number | null;
    UnitDescription: string | null;
    DecimalQuantity: number | null;
    DecimalPrice: number | null;
    DecimalForeignPrice: number | null;
    DecimalCostPrice: number | null;
    DecimalDiscountPercentage: number | null;
    DecimalNetValue: number | null;
    DecimalGrossValue: number | null;
    DecimalCostValue: number | null;
    DecimalTaxValue: number | null;
    MarginPercentage: number | null;
    ProductItem?: ProductItem;
    RecordLink: string | null;
    StatusFlag: string;
    Created: string | null;
    LastUpdated: string | null;
}
/** Fields for creating a quote line via POST */
export interface QuoteLineCreate {
    QuoteId: number;
    ProductItemId?: string;
    Description: string;
    ExtendedDescription?: string;
    DecimalPrice?: number;
    DecimalCostPrice?: number;
    DecimalDiscountPercentage?: number;
    Sequence?: number;
    TaxCode?: string;
    GroupId?: number;
    Quantity?: number;
    Price?: number;
    CostPrice?: number;
    QuantityDecimals?: number;
    SellDecimals?: number;
    CostDecimals?: number;
}
/** Fields for updating a quote line via PATCH */
export type QuoteLineUpdate = Partial<Omit<QuoteLineCreate, "QuoteId">>;
export interface QuoteLineGroup {
    QuoteId: number;
    GroupId: number;
    Title: string;
    ShowSubtotal: boolean;
    Sequence: number;
    ShowPriceColumn: boolean;
    ShowDiscount: boolean;
}
export interface QuoteStatus {
    QuoteStatusCode: number;
    Description: string | null;
    DeadFlag: number | null;
}
export interface Contact {
    ContactId: number;
    DivisionId: number;
    Forename: string | null;
    Surname: string | null;
    Email: string | null;
    PhoneNumber: string | null;
    MobilePhoneNumber: string | null;
    JobTitle: string | null;
    RecordLink: string | null;
    Division?: Division;
}
export interface Division {
    DivisionId: number;
    Name: string | null;
    SalesLedgerId: string | null;
    TerritoryCode: string | null;
    AccountManager: string | null;
    RecordLink: string | null;
    Address?: {
        AddressLine1: string | null;
        AddressLine2: string | null;
        AddressLine3: string | null;
        Postcode: string | null;
    };
}
export interface ProductItem {
    ProductItemId: string;
    Description: string | null;
    DecimalSellingPrice: number | null;
    DecimalCostPrice: number | null;
    DecimalQuantityAvailable: number | null;
    CategoryId: string | null;
    UnitDescription: string | null;
    Obsolete: number | null;
    SalesAnalysis: number | null;
}
export interface User {
    UserCode: string;
    UserName: string | null;
    EmailAddress: string | null;
}
export interface Lead {
    LeadId: number;
    ContactId: number;
    DivisionId: number;
    AddressId: number;
    StatusId: string;
    StatusDetailId: string | null;
    SizeId: string;
    TypeId: string | null;
    PipelineId: string | null;
    SourceId: string | null;
    SourceOther: string | null;
    ObjectiveId: string | null;
    MarginId: string | null;
    Analysis1Id: string | null;
    SalesPersonId: string | null;
    OwnerId: string;
    Description: string | null;
    SituationSummary: string | null;
    AlternateReference: string | null;
    Guttometer: number;
    Value: number | null;
    WeightedValue: number | null;
    WorstValue: number | null;
    LikelyValue: number | null;
    BestValue: number | null;
    MarginValue: number | null;
    AutocalculateValue: boolean;
    EstimatedClose: string | null;
    CloseDate: string | null;
    LastSpoke: string | null;
    StatusChanged: string | null;
    FirstActiveEngagement: string | null;
    LastActiveEngagement: string | null;
    Created: string | null;
    LastUpdated: string | null;
    CreatedByUserId: string | null;
    StatusFlag: string;
    RecordLink: string | null;
    Contact?: Contact;
    Division?: Division;
    Status?: LeadStatus;
    StatusDetail?: LeadStatusDetail;
    Size?: LeadSize;
    Source?: LeadSource;
    Type?: LeadType;
    Pipeline?: LeadPipeline;
    SalesPerson?: User;
    Owner?: User;
}
/** Fields accepted when creating a Lead/Opportunity via POST.
 *  Required (non-nullable, no default): ContactId, SizeId, DivisionId, AddressId, StatusId.
 *  DivisionId and AddressId are auto-derived from Contact if omitted. */
export interface LeadCreate {
    ContactId: number;
    DivisionId?: number;
    AddressId?: number;
    SizeId: string;
    StatusId: string;
    TypeId?: string;
    PipelineId?: string;
    SourceId?: string;
    SourceOther?: string;
    ObjectiveId?: string;
    MarginId?: string;
    Analysis1Id?: string;
    SalesPersonId?: string;
    Description?: string;
    SituationSummary?: string;
    AlternateReference?: string;
    Value?: number;
    MarginValue?: number;
    EstimatedClose?: string;
    AutocalculateValue?: boolean;
}
/** Fields accepted when updating a Lead via PATCH */
export type LeadUpdate = Partial<Omit<LeadCreate, "ContactId">>;
export interface LeadStatus {
    Code: string;
    Description: string | null;
    Sequence: number;
    Obsolete: number;
    DeadFlag: number;
}
export interface LeadStatusDetail {
    StatusId: string;
    Code: string;
    Description: string | null;
    Sequence: number;
    Obsolete: number;
}
export interface LeadSize {
    Code: string;
    Description: string | null;
    Sequence: number;
    Obsolete: number;
}
export interface LeadSource {
    Code: string;
    Description: string | null;
    Obsolete: number;
}
export interface LeadType {
    Code: string;
    Description: string | null;
    Obsolete: number;
}
export interface LeadPipeline {
    Code: string;
    Description: string | null;
    Obsolete: number;
}
//# sourceMappingURL=prospect.d.ts.map