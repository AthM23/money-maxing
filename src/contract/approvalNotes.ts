/**
 * Notes the runtime itself writes on an approval, which the read-model has to recognise. A person who decides a held
 * amount instead of keeping the hold sets that hold aside: on record it is a declined approval whose note starts with
 * this, followed by the treatment they chose.
 */
export const DECIDED_INSTEAD_OF_HELD = "decided instead of held:";
