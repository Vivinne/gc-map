/* C2 address: page address of a screen, and rate-limited address writes (see MODULES.md). */
export { fromQuery, toQuery } from './query';
export { ADDRESS_GAP, createAddressWriter, flushAddress, setAddress, type AddressWriter, type Clock } from './writer';
