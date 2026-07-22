#!/usr/bin/env python3
"""
Patch Mach-O binary after dylib injection.
Updates LC_ENCRYPTION_INFO_64 cryptoff to account for shifted load commands.
"""
import struct
import sys
import os

# Correct Mach-O load command values from <mach-o/loader.h>
LC_SEGMENT = 0x1
LC_SYMTAB = 0x2
LC_DYSYMTAB = 0xb
LC_LOAD_DYLIB = 0xc
LC_ID_DYLIB = 0xd
LC_PREBOUND_DYLIB = 0x10
LC_SEGMENT_64 = 0x19
LC_ROUTINES_64 = 0x1a
LC_UUID = 0x1b
LC_CODE_SIGNATURE = 0x1d
LC_ENCRYPTION_INFO = 0x21
LC_DYLD_INFO = 0x22
LC_MAIN = 0x80000028
LC_ENCRYPTION_INFO_64 = 0x2c

CMD_NAMES = {
    LC_SEGMENT: "LC_SEGMENT",
    LC_SYMTAB: "LC_SYMTAB",
    0x05: "LC_UNIXTHREAD",
    LC_DYSYMTAB: "LC_DYSYMTAB",
    LC_LOAD_DYLIB: "LC_LOAD_DYLIB",
    LC_ID_DYLIB: "LC_ID_DYLIB",
    0x0e: "LC_LOAD_DYLINKER",
    0x10: "LC_PREBOUND_DYLIB",
    0x11: "LC_ROUTINES",
    0x15: "LC_SUB_LIBRARY",
    0x18: "LC_LOAD_WEAK_DYLIB",
    LC_SEGMENT_64: "LC_SEGMENT_64",
    LC_ROUTINES_64: "LC_ROUTINES_64",
    LC_UUID: "LC_UUID",
    0x8000001c: "LC_RPATH",
    LC_CODE_SIGNATURE: "LC_CODE_SIGNATURE",
    0x1e: "LC_SEGMENT_SPLIT_INFO",
    0x20: "LC_LAZY_LOAD_DYLIB",
    LC_ENCRYPTION_INFO: "LC_ENCRYPTION_INFO",
    LC_DYLD_INFO: "LC_DYLD_INFO",
    0x80000022: "LC_DYLD_INFO_ONLY",
    0x24: "LC_VERSION_MIN_MACOSX",
    0x25: "LC_VERSION_MIN_IPHONEOS",
    0x26: "LC_FUNCTION_STARTS",
    LC_MAIN: "LC_MAIN",
    0x29: "LC_DATA_IN_CODE",
    LC_ENCRYPTION_INFO_64: "LC_ENCRYPTION_INFO_64",
    0x80000033: "LC_DYLD_CHAINED_FIXUPS",
    0x80000034: "LC_DYLD_EXPORTS_TRIE",
}

MACHO_HEADER_64_SIZE = 0x20
MACHO_HEADER_32_SIZE = 0x1C

def get_header_info(data):
    magic = struct.unpack_from('<I', data, 0)[0]
    if magic == 0xFEEDFACF:
        return MACHO_HEADER_64_SIZE, "Mach-O 64-bit"
    elif magic == 0xFEEDFACE:
        return MACHO_HEADER_32_SIZE, "Mach-O 32-bit"
    else:
        return None, f"Unknown magic={hex(magic)}"

def find_encryption_info(data):
    header_size, desc = get_header_info(data)
    if header_size is None:
        print(f"Not a Mach-O: {desc}")
        return None

    ncmds = struct.unpack_from('<I', data, 16)[0]
    offset = header_size

    for i in range(ncmds):
        if offset + 8 > len(data):
            break
        cmd = struct.unpack_from('<I', data, offset)[0]
        cmdsize = struct.unpack_from('<I', data, offset + 4)[0]
        if cmdsize == 0:
            break

        if cmd == LC_ENCRYPTION_INFO_64:
            cryptoff = struct.unpack_from('<I', data, offset + 8)[0]
            cryptsize = struct.unpack_from('<I', data, offset + 12)[0]
            cryptid = struct.unpack_from('<I', data, offset + 16)[0]
            return {
                'cmd_offset': offset,
                'cryptoff_offset': offset + 8,
                'cryptoff': cryptoff,
                'cryptsize': cryptsize,
                'cryptid': cryptid,
            }

        offset += cmdsize

    return None

def list_load_commands(filepath):
    with open(filepath, 'rb') as f:
        data = f.read()

    header_size, desc = get_header_info(data)
    if header_size is None:
        print(f"Not a Mach-O: {desc}")
        return False

    ncmds = struct.unpack_from('<I', data, 16)[0]
    sizeofcmds = struct.unpack_from('<I', data, 20)[0]
    print(f"Binary: {desc}, ncmds={ncmds}, sizeofcmds={sizeofcmds}")
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

        cmd_name = CMD_NAMES.get(cmd, f"cmd_0x{cmd:x}")

        if cmd == LC_ENCRYPTION_INFO_64:
            cryptoff = struct.unpack_from('<I', data, offset + 8)[0]
            cryptsize = struct.unpack_from('<I', data, offset + 12)[0]
            cryptid = struct.unpack_from('<I', data, offset + 16)[0]
            print(f"  [{i}] {cmd_name} at {hex(offset)}, size={cmdsize}")
            print(f"       cryptoff={hex(cryptoff)}, cryptsize={cryptsize}, cryptid={cryptid}")
            found_encryption = True
        elif cmd == LC_ENCRYPTION_INFO:
            cryptoff = struct.unpack_from('<I', data, offset + 8)[0]
            cryptsize = struct.unpack_from('<I', data, offset + 12)[0]
            cryptid = struct.unpack_from('<I', data, offset + 16)[0]
            print(f"  [{i}] {cmd_name} (32-bit) at {hex(offset)}, size={cmdsize}")
            print(f"       cryptoff={hex(cryptoff)}, cryptsize={cryptsize}, cryptid={cryptid}")
            found_encryption = True
        elif cmd in (LC_SEGMENT_64, LC_SEGMENT):
            segname = data[offset+8:offset+24].split(b'\x00')[0].decode('ascii', errors='replace')
            print(f"  [{i}] {cmd_name} ({segname}) at {hex(offset)}, size={cmdsize}")
        else:
            print(f"  [{i}] {cmd_name} at {hex(offset)}, size={cmdsize}")

        offset += cmdsize

    print(f"\nLoad commands end at: {hex(offset)}")
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

    info = find_encryption_info(data)
    if info is None:
        print("  No LC_ENCRYPTION_INFO_64 found")
        return

    print(f"  Found LC_ENCRYPTION_INFO_64 at {hex(info['cmd_offset'])}")
    print(f"  Before: cryptoff={hex(info['cryptoff'])}, cryptid={info['cryptid']}")

    if shift > 0:
        new_cryptoff = info['cryptoff'] + shift
        struct.pack_into('<I', data, info['cryptoff_offset'], new_cryptoff)
        print(f"  After:  cryptoff={hex(new_cryptoff)}")
        with open(filepath, 'wb') as f:
            f.write(data)
        print(f"  Patched {os.path.basename(filepath)}")
    else:
        print("  No shift needed")

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
        with open(sys.argv[2], 'rb') as f:
            data = f.read()
        info = find_encryption_info(data)
        if info:
            print(f"Encrypted: cryptid={info['cryptid']}")
            sys.exit(1 if info['cryptid'] else 0)
        else:
            print("No encryption info found")
            sys.exit(0)

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
