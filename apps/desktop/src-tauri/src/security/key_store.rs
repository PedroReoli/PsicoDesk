use std::{fs, path::Path};

use rand::{rngs::OsRng, RngCore};

use crate::error::AppError;

pub fn load_or_create(path: &Path) -> Result<Vec<u8>, AppError> {
    if path.exists() {
        return unprotect(&fs::read(path)?);
    }

    let mut key = vec![0u8; 32];
    OsRng.fill_bytes(&mut key);
    let protected = protect(&key)?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, protected)?;
    fs::rename(temporary, path)?;
    Ok(key)
}

#[cfg(windows)]
fn protect(input: &[u8]) -> Result<Vec<u8>, AppError> {
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{CryptProtectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB},
    };

    let input_blob = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_ptr() as *mut u8,
    };
    let mut output_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let success = unsafe {
        CryptProtectData(
            &input_blob,
            ptr::null(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output_blob,
        )
    };
    if success == 0 {
        return Err(AppError::Security(
            "O Windows não conseguiu proteger a chave local.".into(),
        ));
    }
    let bytes =
        unsafe { slice::from_raw_parts(output_blob.pbData, output_blob.cbData as usize).to_vec() };
    unsafe { LocalFree(output_blob.pbData as *mut core::ffi::c_void) };
    Ok(bytes)
}

#[cfg(windows)]
fn unprotect(input: &[u8]) -> Result<Vec<u8>, AppError> {
    use std::{ptr, slice};
    use windows_sys::Win32::{
        Foundation::LocalFree,
        Security::Cryptography::{
            CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
        },
    };

    let input_blob = CRYPT_INTEGER_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_ptr() as *mut u8,
    };
    let mut output_blob = CRYPT_INTEGER_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let success = unsafe {
        CryptUnprotectData(
            &input_blob,
            ptr::null_mut(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output_blob,
        )
    };
    if success == 0 {
        return Err(AppError::Security(
            "A chave local não pôde ser recuperada pelo usuário atual do Windows.".into(),
        ));
    }
    let bytes =
        unsafe { slice::from_raw_parts(output_blob.pbData, output_blob.cbData as usize).to_vec() };
    unsafe { LocalFree(output_blob.pbData as *mut core::ffi::c_void) };
    Ok(bytes)
}

#[cfg(not(windows))]
fn protect(_input: &[u8]) -> Result<Vec<u8>, AppError> {
    Err(AppError::Security(
        "O armazenamento de chaves exige Windows.".into(),
    ))
}

#[cfg(not(windows))]
fn unprotect(_input: &[u8]) -> Result<Vec<u8>, AppError> {
    Err(AppError::Security(
        "O armazenamento de chaves exige Windows.".into(),
    ))
}
