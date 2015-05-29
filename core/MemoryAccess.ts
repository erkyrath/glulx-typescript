// Written in 2015 by Thilo Planz 
// To the extent possible under law, I have dedicated all copyright and related and neighboring rights 
// to this software to the public domain worldwide. This software is distributed without any warranty. 
// http://creativecommons.org/publicdomain/zero/1.0/

module FyreVM {
	
	/**
	 * Abstraction for access to memory buffers
	 * (because the Node.js and browser implementations are different)
	 */
	
	export interface MemoryAccess {
		/**
		 * Reads an unsigned, big-endian, 16-bit number
		 */
		 readInt16(offset: number) : number;
		
		/**
		 * Writes an unsigned, big-endian, 16-bit number
		 */
		 writeInt16(offset: number, value: number);
	}
	
	/**
	 * a struct to keep track of heap fragments
	 */
	
	class HeapEntry {
		offset: number;
		length: number;
		constructor(offset: number, length: number){
			this.offset = offset;
			this.length = length;
		}
	}
	
	/**
	 * abstraction to resize the available memory
	 */
	
	export interface MemoryRequester {
		(newEndMem: number) : boolean
	}
	
	/**
	 * Manages the heap size and block allocation for the malloc/mfree opcodes.
	 * 
	 * If Inform ever starts using the malloc opcode directly, instead of
     * its own heap allocator, this should be made a little smarter.
     * Currently we make no attempt to avoid heap fragmentation.
	 */
	
	export class HeapAllocator {
		private heapAddress: number;
		private endMem: number;
		private heapExtent = 0;
		private maxHeapExtent = 0
		private requester: MemoryRequester;
		private blocks: HeapEntry[] = [];
		private freeList: HeapEntry[] = [];
		
		
		constructor(heapAddress: number, requester: MemoryRequester){
			this.heapAddress = heapAddress;
			this.requester = requester;
			this.endMem = heapAddress;
		}
		
		/**
		 * allocates a new block on the heap
		 * @return the address of the new block, or null if allocation failed
		 */
		alloc(size: number) : number{
				let {blocks, freeList} = this;
		
				let result = new HeapEntry(-1, size);
				// look for a free block
				for(let i=0; i<freeList.length; i++){
					let entry = freeList[i];
					if(entry && entry.length >= size){
						result.offset = entry.offset;
						if (entry.length > size){
							// keep the rest in the free list
							entry.offset += size;
							entry.length -= size;
						}else{
							freeList[i] = null;
						}
						break;
					}
				}
				if (result.offset === -1){
					// enforce max heap size
					if (this.maxHeapExtent && this.heapExtent + size > this.maxHeapExtent){
						return null;
					}
					// add a new block
					result.offset = this.heapAddress + this.heapExtent;
					if (result.offset + size > this.endMem){
						// grow the heap
						let newHeapAllocation = Math.max(
							this.heapExtent * 5 / 4, this.heapExtent + size);
						if (this.maxHeapExtent){
							newHeapAllocation = Math.min(newHeapAllocation, this.maxHeapExtent);
						}
						
						if (! this.setEndMem(newHeapAllocation)){
							return null;
						}
					}
					
					this.heapExtent += size;
				}
				
				// TODO: keep the list sorted
				blocks.push(result);
				
				return result.offset;
		}
		
		private setEndMem(newHeapAllocation: number) : boolean{
			let newEndMem = this.heapAddress + newHeapAllocation;
			if (this.requester(newEndMem)){
				this.endMem = newEndMem;
				return true;
			}
			return false;
		}
		
		blockCount() : number {
			return this.blocks.length;
		}
		
		/**
		 * deallocates a previously allocated block
		 */
		free(address: number){
			let {blocks, freeList} = this;
			// find the block
			for(let i=0; i<blocks.length; i++){
				let block = blocks[i];
				if (block.offset === address){
					// remove it
					blocks.splice(i, 1);
					// shrink the heap if that was at the end
					if (address+block.length-this.heapAddress === this.heapExtent){
						let newHeapExtent = this.heapAddress;
						for(let j=0; j<blocks.length; j++){
							let b = blocks[j];
							newHeapExtent = Math.max(newHeapExtent, b.length + b.offset);
						}
						this.heapExtent = newHeapExtent - this.heapAddress;
					} else {
						// add to the free list
						freeList.push(block);
						// TODO: keep sorted and coalesce free list
					}
					
					// shrink the heap
					if (blocks.length > 0 && this.heapExtent <= (this.endMem - this.heapAddress) / 2){
						if (this.setEndMem(this.heapExtent)){
							var newEndMem = this.endMem;
							for(let i=0; i<freeList.length; i++){
								let entry = freeList[i];
								if (entry && entry.offset >= newEndMem){
									freeList[i] = null;
								}
							}		
						}
					}
					
					return;	
				}
			}
		}
	}
}



