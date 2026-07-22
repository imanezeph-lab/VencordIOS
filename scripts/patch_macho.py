#!/usr/bin/env python3
"""
Patch Mach-O binary after dylib injection.
Updates LC_ENCRYPTION_INFO_64 cryptoff to account for shifted load commands.
"""
import struct
import sys
import os

MACHO_HEADER_64_SIZE = 0x20  # 32 bytes for mach_header_64
MACHO_HEADER_32_SIZE = 0x1C  # 28 bytes for mach_header

LC_ENCRYPTION_INFO_64 = 0x21

CMD_NAMES = {
    0x01: "LC_SEGMENT",
    0x02: "LC_SYMTAB",
    0x05: "LC_DYSYMTAB",
    0x0C: "LC_LOAD_DYLIB",
    0x0D: "LC_ID_DYLIB",
    0x11: "LC_PREBOUND_DYLIB",
    0x15: "LC_SEGMENT_64",
    0x19: "LC_CODE_SIGNATURE",
    0x1A: "LC_SEGMENT_SPLIT_INFO",
    0x1B: "LC_ENCRYPTION_INFO",
    0x21: "LC_ENCRYPTION_INFO_64",
    0x22: "LC_LAZY_LOAD_DYLIB",
    0x26: "LC_DYLD_INFO",
    0x29: "LC_DYLD_CHAINED_FIXUPS",
    0x80000018: "LC_MAIN",
    0x80000022: "LC_BUILD_VERSION",
}

def list_load_commands(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()

    magic = struct.unpack_from('<I', data, 0)[0]

    if magic == 0xFEEDFACF:
        header_size = MACHO_HEADER_64_SIZE
        print(f"Binary: Mach-O 64-bit (magic={hex(magic)})")
    elif magic == 0xFEEDFACE:
        header_size = MACHO_HEADER_32_SIZE
        print(f"Binary: Mach-O 32-bit (magic={hex(magic)})")
    elif magic == 0xBEBAFECA or magic == 0xCAFEBABF:
        print(f"Binary: FAT binary (magic={hex(magic)}) - cannot parse directly")
        return
    else:
        print(f"Binary: Unknown magic={hex(magic)}")
        return

    filetype = struct.unpack_from('<I', data, 12)[0]
    ncmds = struct.unpack_from('<I', data, 16)[0]
    sizeofcmds = struct.unpack_from('<I', data, 20)[0]
    print(f"filetype={filetype}, ncmds={ncmds}, sizeofcmds={sizeofcmds}")
    print(f"Load commands start at offset {hex(header_size)}")

    offset = header_size
    found_encryption = False

    for i in range(ncmds):
        if offset + 8 > len(data):
            print(f"  [truncated at offset {hex(offset)}]")
            break
        cmd = struct.unpack_from('<I', data, offset)[0]
        cmdsize = struct.unpack_from('<I', data, offset + 4)[0]
        if cmdsize == 0:
            print(f"  [zero cmdsize at offset {hex(offset)}]")
            break

        cmd_name = CMD_NAMES.get(cmd, f"unknown(0x{cmd:x})")

        if cmd == LC_ENCRYPTION_INFO_64 or cmd == 0x1B:  # 64 or 32 bit
            cryptoff = struct.unpack_from('<I', data, offset + 8)[0]
            cryptsize = struct.unpack_from('<I', data, offset + 12)[0]
            cryptid = struct.unpack_from('<I', data, offset + 16)[0]
            print(f"  [{i}] {cmd_name} at {hex(offset)}, size={cmdsize}")
            print(f"       cryptoff={hex(cryptoff)}, cryptsize={cryptsize}, cryptid={cryptid}")
            found_encryption = True
        else:
            print(f"  [{i}] {cmd_name} at {hex(offset)}, size={cmdsize}")

        offset += cmdsize

    print(f"\nTotal load commands scanned: {i+1 if ncmds > 0 else 0}")
    print(f"Load commands end at: {hex(offset)}")
    print(f"Encryption found: {found_encryption}")
    return found_encryption

def get_load_cmd_shift(original_path, patched_path):
    with open(original_path, 'rb') as f:
        orig = f.read()
    with open(patched_path, 'rb') as f:
        patched = f.read()

    orig_sizeofcmds = struct.unpack_from('<I', orig, 20)[0]
    new_sizeofcmds = struct.unpack_from('<I', patched, 20)[0]
    shift = new_sizeofcmds - orig_sizeofcmds
    print(f"Load commands shift: {shift} bytes (orig: {orig_sizeofcmds}, new: {new_sizeofcmds})")
    return shift

def patch_cryptoff(filepath, shift):
    with open(filepath, 'rb') as f:
        data = bytearray(f.read())

    magic = struct.unpack_from('<I', data, 0)[0]

    if magic == 0xFEEDFACF:
        header_size = MACHO_HEADER_64_SIZE
    elif magic == 0xFEEDFACE:
        header_size = MACHO_HEADER_32_SIZE
    else:
        print(f"Unknown magic: {hex(magic)}")
        return

    ncmds = struct.unpack_from('<I', data, 16)[0]
    offset = header_size
    patched = False

    for i in range(ncmds):
        if offset + 8 > len(data):
            break
        cmd = struct.unpack_from('<I', data, offset)[0]
        cmdsize = struct.unpack_from('<I', data, offset + 4)[0]
        if cmdsize == 0:
            break

        if cmd == LC_ENCRYPTION_INFO_64 or cmd == 0x1B:
            cryptoff = struct.unpack_from('<I', data, offset + 8)[0]
            cryptid = struct.unpack_from('<I', data, offset + 16)[0]
            print(f"  Found {CMD_NAMES.get(cmd, 'ENCRYPTION')} at {hex(offset)}")
            print(f"  Before: cryptoff={hex(cryptoff)}, cryptid={cryptid}")

            if shift > 0:
                new_cryptoff = cryptoff + shift
                struct.pack_into('<I', data, offset + 8, new_cryptoff)
                print(f"  After:  cryptoff={hex(new_cryptoff)}")
                patched = True

        offset += cmdsize

    if patched:
        with open(filepath, 'wb') as f:
            f.write(data)
        print(f"  Patched {os.path.basename(filepath)}")
    else:
        print(f"  No encryption info found in {os.path.basename(filepath)}")

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: patch_macho.py <command> [args]")
        print("  list <binary>            - List all load commands")
        print("  check <binary>           - Check if binary is encrypted")
        print("  patch <orig> <patched>   - Patch cryptoff after injection")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'list':
        list_load_commands(sys.argv[2])

    elif cmd == 'check':
        result = list_load_commands(sys.argv[2])
        print(f"\nEncrypted: {result}")
        sys.exit(0 if not result else 1)

    elif cmd == 'patch':
        orig = sys.argv[2]
        patched = sys.argv[3]
        shift = get_load_cmd_shift(orig, patched)
        if shift > 0:
            patch_cryptoff(patched, shift)
        else:
            print("No shift, no patching needed")

    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)
